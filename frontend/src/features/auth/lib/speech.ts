/**
 * 语音识别模块 — 基于 MiMo ASR
 * 优化：2 秒切片 + 静音即发 + 重叠处理
 */

// ---------- 音频工具函数 ----------

function resample(float32Array: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return float32Array;
  const ratio = fromRate / toRate;
  const newLength = Math.round(float32Array.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const srcIdx = i * ratio;
    const idx = Math.floor(srcIdx);
    const frac = srcIdx - idx;
    result[i] =
      idx + 1 < float32Array.length
        ? float32Array[idx] * (1 - frac) + float32Array[idx + 1] * frac
        : float32Array[idx];
  }
  return result;
}

function encodeWAV(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  function writeStr(off: number, s: string) {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  }
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function mergeBuffers(buffers: Float32Array[], length: number): Float32Array {
  const result = new Float32Array(length);
  let offset = 0;
  for (const buf of buffers) {
    result.set(buf, offset);
    offset += buf.length;
  }
  return result;
}

function audioBlobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}


/** 去掉尾部中文标点（中间切片用） */
function stripTrailingPunct(s: string): string {
  return s.replace(/[。，！？、；：…,.!?;:]+$/, "");
}

/** ASR 常见的静音幻觉词，过滤掉避免噪音文字 */
const FILLER_PATTERNS = /^(嗯|啊|哦|额|呃|emm+|uh+|ah+|oh+|yeah+|yep+|ok+|okay+|哈|呵|嘿嘿|嘻嘻|哼|唉|哎|喂|啦|吧|呢|嘛|呀|哪|嘛|么|了|的|吗|呗|喽|嘞|噢|唷|喔|唔|嘻|<chinese>|<english>|<foreign>|<unclear>|\.{3,}|…+)$/i;
function isSentenceEnd(text: string): boolean {
  return /[。！？!?]/.test(text);
}

function isFillerOnly(text: string): boolean {
  return FILLER_PATTERNS.test(text.trim());
}

/** 清理 ASR 输出中的 XML 标签（如 <chinese>、<english> 等） */
function stripAsrTags(s: string): string {
  return s.replace(/<\/?[a-zA-Z]+>/g, "");
}

// ---------- 类型 ----------

export interface SpeechCallbacks {
  onText?: (text: string) => void;
  onStatus?: (status: string) => void;
  onError?: (err: string) => void;
}

// ---------- 录音引擎 ----------

/** 定时切片间隔（秒） */
const CHUNK_INTERVAL = 3;
/** 静音超过此时长（秒）则立即发送当前缓冲 */
const SILENCE_SEND_THRESHOLD = 1.5;
/** 静音超过此时长（秒）则停止采集当前切片 */
const SILENCE_STOP_THRESHOLD = 3;

export class SpeechRecorder {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptNode: ScriptProcessorNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private chunkBuffers: Float32Array[] = [];
  private chunkTimer: ReturnType<typeof setInterval> | null = null;
  private actualSampleRate = 0;
  private silenceFrames = 0;
  private isRecording = false;
  private pendingRequests = 0;
  private recognizedText = "";
  private callbacks: SpeechCallbacks;
  private abortController: AbortController | null = null;
  private sentenceBuffer = "";

  constructor(callbacks: SpeechCallbacks = {}) {
    this.callbacks = callbacks;
  }

  get text() { return this.recognizedText; }
  set text(v: string) { this.recognizedText = v; }
  get recording() { return this.isRecording; }
  get analyser(): AnalyserNode | null { return this.analyserNode; }
  get audioCtx(): AudioContext | null { return this.audioContext; }

  async start(initialText?: string) {
    if (this.isRecording) return;

    // 安全上下文检查：navigator.mediaDevices 仅在 HTTPS 或 localhost 可用
    if (!window.isSecureContext || !navigator.mediaDevices) {
      throw new Error("麦克风需要 HTTPS 环境，请联系管理员配置 SSL 证书");
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.actualSampleRate = this.audioContext.sampleRate;

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.8;

      this.scriptNode = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.chunkBuffers = [];
      this.silenceFrames = 0;

      this.scriptNode.onaudioprocess = (e) => {
        if (!this.isRecording) return;
        const inputData = e.inputBuffer.getChannelData(0);

        let maxVol = 0;
        for (let i = 0; i < inputData.length; i++) {
          const abs = Math.abs(inputData[i]);
          if (abs > maxVol) maxVol = abs;
        }

        if (maxVol < 0.02) {
          this.silenceFrames++;
        } else {
          // 有声音 → 重置静音计数，并立即加入缓冲
          this.silenceFrames = 0;
          this.chunkBuffers.push(new Float32Array(inputData));
          return;
        }

        const silenceDuration = this.silenceFrames * (4096 / this.actualSampleRate);

        // 静音阈值 1：超过 1.5 秒静音，立即发送当前缓冲（用户停顿了）
        if (silenceDuration >= SILENCE_SEND_THRESHOLD && this.chunkBuffers.length > 0) {
          this.flushChunk();
          return;
        }

        // 静音阈值 2：超长静音（3秒），不再采集，等定时器重新开始
        if (silenceDuration < SILENCE_STOP_THRESHOLD) {
          // 保留少量静音帧，让语句过渡自然
          this.chunkBuffers.push(new Float32Array(inputData));
        }
      };

      this.sourceNode.connect(this.analyserNode);
      this.analyserNode.connect(this.scriptNode);
      this.scriptNode.connect(this.audioContext.destination);

      this.isRecording = true;
      this.recognizedText = initialText || "";

      // 定时切片：每 2 秒发送一次（不管有没有声音）
      this.chunkTimer = setInterval(() => {
        this.flushChunk();
      }, CHUNK_INTERVAL * 1000);

      this.callbacks.onStatus?.("");
    } catch (e: any) {
      this.callbacks.onError?.("无法访问麦克风: " + e.message);
    }
  }

  /** 取出当前缓冲并发送 */
  private flushChunk() {
    if (this.chunkBuffers.length === 0) return;
    const buffers = this.chunkBuffers;
    this.chunkBuffers = [];
    this.silenceFrames = 0;

    // 检查缓冲区整体音量，低于阈值则跳过（避免静音发送）
    let sumSq = 0;
    let totalSamples = 0;
    for (const buf of buffers) {
      for (let i = 0; i < buf.length; i++) {
        sumSq += buf[i] * buf[i];
        totalSamples++;
      }
    }
    const rms = Math.sqrt(sumSq / totalSamples);
    if (rms < 0.015) return; // 音量太低，跳过

    const totalLen = buffers.reduce((sum, b) => sum + b.length, 0);
    this.sendChunk(mergeBuffers(buffers, totalLen));
  }

  async stop(): Promise<string> {
    if (!this.isRecording) return this.recognizedText;
    this.isRecording = false;

    if (this.chunkTimer) {
      clearInterval(this.chunkTimer);
      this.chunkTimer = null;
    }

    // 发送剩余缓冲
    this.flushChunk();

    if (this.scriptNode) { this.scriptNode.disconnect(); this.scriptNode = null; }
    if (this.analyserNode) { this.analyserNode.disconnect(); this.analyserNode = null; }
    if (this.sourceNode) { this.sourceNode.disconnect(); this.sourceNode = null; }
    if (this.audioContext) { this.audioContext.close(); this.audioContext = null; }
    if (this.mediaStream) { this.mediaStream.getTracks().forEach((t) => t.stop()); this.mediaStream = null; }

    await this.waitForPending();
    this.callbacks.onStatus?.("已停止");
    return this.recognizedText;
  }

  async cancel() {
    this.abortController?.abort();
    await this.stop();
    this.recognizedText = "";
    this.callbacks.onText?.("");
  }

  /** 调用 AI 纠错接口，修正同音错别字 */
  private async correctText(raw: string): Promise<string> {
    if (!raw.trim() || raw.trim().length < 2) return raw;
    try {
      const token = localStorage.getItem("token");
      const resp = await fetch("/api/correct", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text: raw, context: this.recognizedText.slice(-100) }),
      });
      if (!resp.ok) return raw;
      const result = await resp.json() as { text?: string; error?: string };
      return result.text || raw;
    } catch {
      return raw;
    }
  }

  private async waitForPending() {
    while (this.pendingRequests > 0) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  private async sendChunk(float32Samples: Float32Array) {
    if (float32Samples.length === 0) return;

    this.pendingRequests++;
    this.callbacks.onStatus?.("识别中...");

    try {
      const resampled = resample(float32Samples, this.actualSampleRate, 16000);
      const wavBlob = encodeWAV(resampled, 16000);
      const base64 = await audioBlobToBase64(wavBlob);

      const controller = new AbortController();
      this.abortController = controller;

      const token = localStorage.getItem("token");
      const resp = await fetch("/api/recognize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ audio: base64 }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        throw new Error(`语音识别请求失败: ${resp.status}`);
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let partial = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        partial += decoder.decode(value, { stream: true });
        const parts = partial.split("\n\n");
        partial = parts.pop()!;
        for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const payload = trimmed.slice(6);
          if (payload === "[DONE]") continue;
          try {
            const chunk = JSON.parse(payload);
            if (chunk.error) throw new Error(chunk.error);
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) {
              const cleanDelta = stripAsrTags(delta);
              if (!cleanDelta) continue;
              this.recognizedText += cleanDelta;
              // 过滤纯填充词（静音幻觉）— 检查本次增量
              const deltaClean = stripTrailingPunct(cleanDelta.trim());
              if (isFillerOnly(deltaClean)) {
                this.recognizedText = this.recognizedText.slice(0, -cleanDelta.length);
                return;
              }
              // 中间切片去掉尾部标点，避免句号碎片
              const display = this.isRecording
                ? stripTrailingPunct(this.recognizedText)
                : this.recognizedText;
              this.callbacks.onText?.(display);

              // 句尾 AI 纠错：遇到句号等标点时异步纠错
              if (isSentenceEnd(delta) && this.isRecording) {
                const sentence = this.recognizedText;
                this.correctText(sentence).then((corrected) => {
                  if (corrected !== sentence && this.isRecording) {
                    this.recognizedText = corrected;
                    const d = stripTrailingPunct(corrected);
                    this.callbacks.onText?.(d);
                  }
                });
              }
            }
          } catch (e: any) {
            if (e.message && !e.message.includes("JSON")) throw e;
          }
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        this.callbacks.onError?.(e.message);
      }
    } finally {
      this.pendingRequests--;
      if (this.isRecording && this.pendingRequests === 0) {
        this.callbacks.onStatus?.("");
      }
    }
  }
}
