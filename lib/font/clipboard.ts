export async function clipboardImage() {
  if (!navigator.clipboard?.read)
    throw Error("此浏览器不支持按钮读取剪贴板，请使用 ⌘V / Ctrl+V 粘贴图片");
  const items = await navigator.clipboard.read();
  for (const item of items) {
    const type = item.types.find((t) =>
      ["image/png", "image/jpeg", "image/webp"].includes(t),
    );
    if (type)
      return new File(
        [await item.getType(type)],
        "pasted-image." + type.split("/")[1],
        { type },
      );
  }
  throw Error("剪贴板里没有图片，请先复制图片或截图");
}
