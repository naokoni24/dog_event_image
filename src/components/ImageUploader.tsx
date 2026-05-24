import { useRef, useState } from "react";

interface Props {
  onImageSelected: (dataUrl: string) => void;
  currentImage: string | null;
}

export function ImageUploader({ onImageSelected, currentImage }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) onImageSelected(e.target.result as string);
    };
    reader.readAsDataURL(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        className={`
          relative w-48 h-48 rounded-2xl border-dashed cursor-pointer
          flex flex-col items-center justify-center gap-2 transition-all
          ${isDragging
            ? "border-amber-500 bg-amber-50 scale-105"
            : currentImage
              ? "border-amber-400 bg-amber-50"
              : "border-amber-300 bg-white hover:border-amber-400 hover:bg-amber-50"
          }
        `}
        style={{ borderWidth: "3px", borderStyle: "dashed" }}
      >
        {currentImage ? (
          <>
            <img
              src={currentImage}
              alt="アップロードされた犬"
              className="w-full h-full object-cover rounded-2xl"
            />
            <div className="absolute inset-0 bg-black/30 rounded-2xl opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="text-white text-sm font-medium">画像を変更</span>
            </div>
          </>
        ) : (
          <>
            <div className="text-5xl">🐶</div>
            <p className="text-sm text-amber-700 text-center px-3">
              犬の画像をアップロード
            </p>
            <p className="text-xs text-amber-500">クリックまたはドラッグ</p>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
    </div>
  );
}
