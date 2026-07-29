import { useEffect, useCallback } from "react";
import { useEditor, EditorContent, Extension } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { toast } from "sonner";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Link as LinkIcon,
  ImageIcon,
} from "lucide-react";
import { API_BASE } from "../config/deploy";
import { TOKEN_KEY } from "../config/storage";

/**
 * Lightweight inline Placeholder extension.
 */
function createPlaceholderExtension(placeholderText: string) {
  const placeholderPlugin = new Plugin({
    key: new PluginKey("placeholder"),
    props: {
      decorations(state) {
        const { doc, selection } = state;
        if (doc.content.size > 0) return DecorationSet.empty;
        if (selection.empty) {
          const widget = document.createElement("span");
          widget.classList.add("rte-placeholder");
          widget.textContent = placeholderText;
          return DecorationSet.create(doc, [Decoration.widget(1, widget)]);
        }
        return DecorationSet.empty;
      },
    },
  });
  return Extension.create({
    name: "placeholder",
    addPlugins() {
      return [placeholderPlugin];
    },
  });
}

/**
 * Upload an image File/Blob to the server and return the URL.
 */
async function uploadImage(file: File): Promise<string> {
  const token = localStorage.getItem(TOKEN_KEY);
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/upload-image`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try { detail = JSON.parse(text).detail || text; } catch {}
    throw new Error(detail || "图片上传失败");
  }
  const data = await res.json();
  return data.url;
}

/**
 * Paste extension: intercepts paste events and uploads pasted images
 * (including screenshots from clipboard) into the editor.
 */
function createPasteImageExtension() {
  return Extension.create({
    name: "pasteImage",
    addProseMirrorPlugins() {
      const editor = this.editor;
      return [
        new Plugin({
          key: new PluginKey("pasteImage"),
          props: {
            handlePaste(view, event) {
              const items = event.clipboardData?.items;
              if (!items) return false;

              const imageFiles: File[] = [];
              for (let i = 0; i < items.length; i++) {
                if (items[i].type.startsWith("image/")) {
                  const file = items[i].getAsFile();
                  if (file) imageFiles.push(file);
                }
              }

              if (imageFiles.length === 0) return false;

              event.preventDefault();

              for (const file of imageFiles) {
                const pos = editor.state.selection.from;
                editor
                  .chain()
                  .focus()
                  .insertContentAt(pos, {
                    type: "image",
                    attrs: { src: "", alt: "上传中..." },
                  })
                  .run();

                uploadImage(file)
                  .then((url) => {
                    const { state } = editor;
                    let foundPos = -1;
                    state.doc.descendants((node, pos) => {
                      if (
                        node.type.name === "image" &&
                        (node.attrs.src === "" ||
                          node.attrs.alt === "上传中...")
                      ) {
                        foundPos = pos;
                        return false;
                      }
                    });
                    if (foundPos >= 0) {
                      editor
                        .chain()
                        .focus()
                        .setNodeMarkup(foundPos, undefined, {
                          src: url,
                          alt: file.name || "图片",
                        })
                        .run();
                    }
                  })
                  .catch((err) => {
                    toast.error("图片上传失败：" + err.message);
                    const { state } = editor;
                    let foundPos = -1;
                    state.doc.descendants((node, pos) => {
                      if (
                        node.type.name === "image" &&
                        (node.attrs.src === "" ||
                          node.attrs.alt === "上传中...")
                      ) {
                        foundPos = pos;
                        return false;
                      }
                    });
                    if (foundPos >= 0) {
                      editor
                        .chain()
                        .focus()
                        .deleteRange({ from: foundPos, to: foundPos + 1 })
                        .run();
                    }
                  });
              }

              return true;
            },
          },
        }),
      ];
    },
  });
}

/**
 * Drop extension: handles drag-and-drop images onto the editor.
 */
function createDropImageExtension() {
  return Extension.create({
    name: "dropImage",
    addProseMirrorPlugins() {
      const editor = this.editor;
      return [
        new Plugin({
          key: new PluginKey("dropImage"),
          props: {
            handleDOMEvents: {
              drop(_view, event) {
                const files = event.dataTransfer?.files;
                if (!files || files.length === 0) return false;

                const imageFiles: File[] = [];
                for (let i = 0; i < files.length; i++) {
                  if (files[i].type.startsWith("image/")) {
                    imageFiles.push(files[i]);
                  }
                }
                if (imageFiles.length === 0) return false;

                event.preventDefault();

                for (const file of imageFiles) {
                  uploadImage(file)
                    .then((url) => {
                      editor
                        .chain()
                        .focus()
                        .setImage({ src: url, alt: file.name || "图片" })
                        .run();
                    })
                    .catch((err) => {
                      toast.error("图片上传失败：" + err.message);
                    });
                }

                return true;
              },
            },
          },
        }),
      ];
    },
  });
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

function ToolbarButton({
  onClick,
  isActive,
  children,
  title,
}: {
  onClick: () => void;
  isActive?: boolean;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      className={`rte-toolbar-btn${isActive ? " rte-toolbar-btn--active" : ""}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "rte-link" },
      }),
      Image.configure({
        HTMLAttributes: { class: "rte-content-image" },
      }),
      createPasteImageExtension(),
      createDropImageExtension(),
      ...(placeholder ? [createPlaceholderExtension(placeholder)] : []),
    ],
    content: value || "",
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "rte-content",
      },
    },
  });

  useEffect(() => {
    if (editor && value !== undefined && editor.getHTML() !== value) {
      editor.commands.setContent(value, false);
    }
  }, [editor, value]);

  if (!editor) return null;

  const addLink = useCallback(() => {
    const currentLink = editor.getAttributes("link").href;
    const url = window.prompt("请输入链接地址：", currentLink || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  const addImage = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const url = await uploadImage(file);
        editor.chain().focus().setImage({ src: url, alt: file.name || "图片" }).run();
      } catch (err) {
        toast.error("图片上传失败：" + (err instanceof Error ? err.message : "未知错误"));
      }
    };
    input.click();
  }, [editor]);

  const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
  const modKey = isMac ? "\u2318" : "Ctrl";

  return (
    <div className="rte-wrapper">
      <div className="rte-toolbar">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive("heading", { level: 1 })}
          title={`标题1 (${modKey}+Alt+1)`}
        >
          <Heading1 size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive("heading", { level: 2 })}
          title={`标题2 (${modKey}+Alt+2)`}
        >
          <Heading2 size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor.isActive("heading", { level: 3 })}
          title={`标题3 (${modKey}+Alt+3)`}
        >
          <Heading3 size={15} />
        </ToolbarButton>
        <span className="rte-toolbar-divider" />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive("bold")}
          title={`加粗 (${modKey}+B)`}
        >
          <Bold size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive("italic")}
          title={`斜体 (${modKey}+I)`}
        >
          <Italic size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive("underline")}
          title={`下划线 (${modKey}+U)`}
        >
          <UnderlineIcon size={15} />
        </ToolbarButton>
        <span className="rte-toolbar-divider" />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive("orderedList")}
          title="有序列表"
        >
          <ListOrdered size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive("bulletList")}
          title="无序列表"
        >
          <List size={15} />
        </ToolbarButton>
        <span className="rte-toolbar-divider" />
        <ToolbarButton
          onClick={() => {
            if (editor.isActive("link")) {
              editor.chain().focus().unsetLink().run();
            } else {
              addLink();
            }
          }}
          isActive={editor.isActive("link")}
          title="插入/取消链接"
        >
          <LinkIcon size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={addImage} title="插入图片（支持粘贴截图）">
          <ImageIcon size={15} />
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} className="rte-editor" />
    </div>
  );
}
