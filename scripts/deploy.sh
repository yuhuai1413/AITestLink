#!/bin/bash
# AITestLink 前端部署脚本
# 用法: scp -r scripts/deploy.sh user@server:/tmp/ && ssh user@server "bash /tmp/deploy.sh"

set -e

# 自动检测 AITestLink 前端目录
DIST_DIR=""
for dir in /opt/aitestlink/frontend/dist /home/*/aitestlink/frontend/dist /var/www/aitestlink/dist; do
  if [ -d "$dir" ]; then
    DIST_DIR="$dir"
    break
  fi
done

if [ -z "$DIST_DIR" ]; then
  echo "未找到 AITestLink dist 目录，请手动指定路径："
  read -p "输入 dist 目录路径: " DIST_DIR
fi

echo "找到 dist 目录: $DIST_DIR"

# 备份旧文件
BACKUP_DIR="${DIST_DIR}.bak.$(date +%Y%m%d%H%M%S)"
echo "备份旧文件到: $BACKUP_DIR"
cp -r "$DIST_DIR" "$BACKUP_DIR"

# 检查当前 JS 文件名
OLD_JS=$(ls "$DIST_DIR"/assets/index-*.js 2>/dev/null | head -1)
echo "当前 JS: $OLD_JS"

if echo "$OLD_JS" | grep -q "Cedh155i"; then
  echo "确认是旧版本，需要更新"
else
  echo "可能是新版本，确认继续? (y/n)"
  read -r confirm
  [ "$confirm" != "y" ] && exit 0
fi

echo "部署完成。请确保新 dist 文件已上传到 $DIST_DIR"
echo "验证方法: curl -s https://aitestlink.cn/ | grep -o 'index-[a-zA-Z0-9]*\.js'"
