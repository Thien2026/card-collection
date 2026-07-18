"use client";

import { useCallback, useId, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Camera, ImagePlus, LoaderCircle, RotateCcw, RotateCw, Trash2, Upload } from "lucide-react";
import {
  IMAGE_UPLOAD_ACCEPT,
  IMAGE_UPLOAD_HELP,
  IMAGE_UPLOAD_MAX_FILES,
} from "@/lib/upload-image";

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 4;

type UploadedImage = {
  id: string;
  token: string | null;
  existingId: string | null;
  url: string;
  crop: { x: number; y: number };
  zoom: number;
  rotation: number;
  croppedArea: Area | null;
};

export function MultiImageUpload({
  initialImages = [],
}: {
  initialImages?: Array<{ id: string; url: string }>;
}) {
  const uid = useId();
  const libraryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<UploadedImage[]>(() =>
    initialImages.map((image) => ({
      id: image.id,
      token: null,
      existingId: image.id,
      url: image.url,
      crop: { x: 0, y: 0 },
      zoom: 1,
      rotation: 0,
      croppedArea: null,
    })),
  );
  const [activeId, setActiveId] = useState<string | null>(
    () => initialImages[0]?.id ?? null,
  );
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const active = images.find((image) => image.id === activeId) ?? images[0];
  const libraryId = `${uid}-library`;
  const cameraId = `${uid}-camera`;

  const uploadFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (!files.length) return;

      const remaining = IMAGE_UPLOAD_MAX_FILES - images.length;
      if (!remaining) {
        setError(`Mỗi card chỉ được tối đa ${IMAGE_UPLOAD_MAX_FILES} ảnh.`);
        return;
      }
      if (files.length > remaining) {
        setError(`Bạn chỉ có thể thêm ${remaining} ảnh nữa.`);
        return;
      }

      setUploading(true);
      setError("");
      const uploaded: UploadedImage[] = [];
      try {
        for (const file of files.slice(0, remaining)) {
          const body = new FormData();
          body.append("file", file);
          const response = await fetch("/api/upload", { method: "POST", body });
          const data = (await response.json().catch(() => ({}))) as {
            error?: string;
            url?: string;
            token?: string;
          };
          if (!response.ok || !data.url || !data.token)
            throw new Error(data.error ?? `Không thể tải ${file.name}.`);
          uploaded.push({
            id: crypto.randomUUID(),
            token: data.token,
            existingId: null,
            url: data.url,
            crop: { x: 0, y: 0 },
            zoom: 1,
            rotation: 0,
            croppedArea: null,
          });
        }
        setImages((current) => {
          const room = IMAGE_UPLOAD_MAX_FILES - current.length;
          return [...current, ...uploaded.slice(0, room)];
        });
        setActiveId((current) => current ?? uploaded[0]?.id ?? null);
      } catch (uploadError) {
        setError(
          uploadError instanceof Error
            ? uploadError.message
            : "Không thể tải ảnh lên.",
        );
      } finally {
        setUploading(false);
        if (libraryInput.current) libraryInput.current.value = "";
        if (cameraInput.current) cameraInput.current.value = "";
      }
    },
    [images.length],
  );

  function updateActive(patch: Partial<UploadedImage>) {
    if (!active) return;
    setImages((current) =>
      current.map((image) =>
        image.id === active.id ? { ...image, ...patch } : image,
      ),
    );
  }

  function removeImage(id: string) {
    setImages((current) => {
      const next = current.filter((image) => image.id !== id);
      setActiveId((activeCurrent) =>
        activeCurrent === id ? (next[0]?.id ?? null) : activeCurrent,
      );
      return next;
    });
  }

  const serialized = JSON.stringify(
    images.map(({ token, existingId, croppedArea, rotation }) =>
      existingId
        ? { id: existingId }
        : {
            token,
            crop: croppedArea
              ? {
                  x: croppedArea.x,
                  y: croppedArea.y,
                  width: croppedArea.width,
                  height: croppedArea.height,
                  rotation,
                }
              : null,
          },
    ),
  );

  return (
    <section className="rounded-2xl border border-app-border bg-surface p-4">
      <input type="hidden" name="images" value={serialized} readOnly />
      {images.map((image, index) =>
        image.existingId ? (
          <input
            key={`keep-${image.id}`}
            type="hidden"
            name="keepImageIds"
            value={image.existingId}
          />
        ) : (
          <input
            key={`new-${image.id}`}
            type="hidden"
            name="newImageTokens"
            value={JSON.stringify({
              token: image.token,
              crop: image.croppedArea
                ? {
                    x: image.croppedArea.x,
                    y: image.croppedArea.y,
                    width: image.croppedArea.width,
                    height: image.croppedArea.height,
                    rotation: image.rotation,
                  }
                : null,
              order: index,
            })}
          />
        ),
      )}
      <input
        ref={libraryInput}
        id={libraryId}
        type="file"
        multiple
        accept={IMAGE_UPLOAD_ACCEPT}
        className="sr-only"
        onChange={(event) => uploadFiles(event.target.files ?? [])}
      />
      <input
        ref={cameraInput}
        id={cameraId}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(event) => uploadFiles(event.target.files ?? [])}
      />

      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-black text-primary">
            Ảnh thẻ ({images.length}/{IMAGE_UPLOAD_MAX_FILES})
          </h2>
          <p className="mt-1 text-[10px] leading-4 text-muted">
            Thêm ảnh không làm mất ảnh cũ. Có thể xóa từng ảnh nếu muốn.
          </p>
        </div>
        {images.length < IMAGE_UPLOAD_MAX_FILES && (
          <label
            htmlFor={libraryId}
            className="shrink-0 cursor-pointer rounded-lg bg-accent-soft px-3 py-2 text-[10px] font-bold text-accent-text"
          >
            Thêm ảnh
          </label>
        )}
      </div>

      {active ? (
        <>
          {active.existingId ? (
            <div className="mx-auto mt-4 max-w-[315px]">
              <div className="aspect-[2.5/3.5] overflow-hidden rounded-2xl bg-panel">
                <img
                  src={active.url}
                  alt="Ảnh hiện có"
                  className="h-full w-full object-contain"
                />
              </div>
              <p className="mt-2 text-center text-[10px] text-muted">
                Ảnh đã lưu
              </p>
            </div>
          ) : (
            <>
              <div className="relative mx-auto mt-4 aspect-[2.5/3.5] max-h-[440px] w-full max-w-[315px] overflow-hidden rounded-2xl bg-slate-950">
                <Cropper
                  image={active.url}
                  crop={active.crop}
                  zoom={active.zoom}
                  rotation={active.rotation}
                  minZoom={MIN_ZOOM}
                  maxZoom={MAX_ZOOM}
                  aspect={2.5 / 3.5}
                  objectFit="contain"
                  restrictPosition={false}
                  showGrid
                  roundCropAreaPixels
                  onCropChange={(crop) => updateActive({ crop })}
                  onZoomChange={(zoom) => updateActive({ zoom })}
                  onRotationChange={(rotation) => updateActive({ rotation })}
                  onCropComplete={(_area, croppedArea) =>
                    updateActive({ croppedArea })
                  }
                />
              </div>
              <div className="mx-auto mt-4 w-full max-w-sm space-y-3">
                <div className="flex items-center gap-3">
                  <span className="w-12 shrink-0 text-[10px] font-bold text-muted">
                    Zoom
                  </span>
                  <input
                    aria-label="Thu phóng ảnh"
                    type="range"
                    min={MIN_ZOOM}
                    max={MAX_ZOOM}
                    step="0.05"
                    value={active.zoom}
                    onChange={(event) =>
                      updateActive({ zoom: Number(event.target.value) })
                    }
                    className="h-1 flex-1 accent-violet-600"
                  />
                  <span className="w-10 text-right text-[10px] font-bold text-secondary">
                    {active.zoom.toFixed(2)}x
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Xoay trái 90 độ"
                    onClick={() =>
                      updateActive({
                        rotation: (active.rotation - 90 + 360) % 360,
                        crop: { x: 0, y: 0 },
                      })
                    }
                    className="grid h-9 w-9 place-items-center rounded-lg border border-app-border text-secondary"
                  >
                    <RotateCcw size={15} />
                  </button>
                  <button
                    type="button"
                    aria-label="Xoay phải 90 độ"
                    onClick={() =>
                      updateActive({
                        rotation: (active.rotation + 90) % 360,
                        crop: { x: 0, y: 0 },
                      })
                    }
                    className="grid h-9 w-9 place-items-center rounded-lg border border-app-border text-secondary"
                  >
                    <RotateCw size={15} />
                  </button>
                  <span className="flex-1 text-center text-[10px] font-bold text-muted">
                    Xoay {active.rotation}°
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      updateActive({
                        crop: { x: 0, y: 0 },
                        zoom: MIN_ZOOM,
                        rotation: 0,
                      })
                    }
                    className="rounded-lg border border-app-border px-2.5 py-2 text-[9px] font-bold text-secondary"
                  >
                    Hiện đủ ảnh
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateActive({
                        crop: { x: 0, y: 0 },
                        zoom: 1,
                        rotation: active.rotation,
                      })
                    }
                    className="rounded-lg border border-app-border px-2.5 py-2 text-[9px] font-bold text-secondary"
                  >
                    Vừa khung
                  </button>
                </div>
                <p className="text-center text-[9px] leading-4 text-muted">
                  Kéo ảnh để căn. Thu nhỏ tối đa để lấy trọn tấm hình vào khung
                  thẻ.
                </p>
              </div>
            </>
          )}

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {images.map((image, index) => (
              <div
                key={image.id}
                className={`relative h-20 w-14 shrink-0 overflow-hidden rounded-lg border-2 ${
                  image.id === active.id
                    ? "border-violet-500"
                    : "border-app-border"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveId(image.id)}
                  aria-label={`Chỉnh ảnh ${index + 1}`}
                  className="h-full w-full"
                >
                  <img
                    src={image.url}
                    alt={`Ảnh ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                </button>
                <span className="absolute left-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-black/70 px-1 text-[8px] font-bold text-white">
                  {index + 1}
                </span>
                <button
                  type="button"
                  aria-label={`Xóa ảnh ${index + 1}`}
                  onClick={() => removeImage(image.id)}
                  className="absolute bottom-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-rose-600 text-white"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            uploadFiles(event.dataTransfer.files);
          }}
          className={`mt-4 rounded-2xl border-2 border-dashed px-5 py-10 text-center transition ${
            dragging
              ? "border-violet-500 bg-violet-500/10"
              : "border-app-border-strong bg-panel"
          }`}
        >
          {uploading ? (
            <LoaderCircle
              className="mx-auto animate-spin text-accent-text"
              size={30}
            />
          ) : (
            <Upload className="mx-auto text-accent-text" size={30} />
          )}
          <p className="mt-3 text-xs font-black text-primary">
            Kéo và thả ảnh vào đây
          </p>
          <p className="mt-1 text-[10px] text-muted">{IMAGE_UPLOAD_HELP}</p>
          <div className="mt-4 flex justify-center gap-2">
            <label
              htmlFor={libraryId}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-[10px] font-bold text-white"
            >
              <ImagePlus size={15} /> Chọn từ thư viện
            </label>
            <label
              htmlFor={cameraId}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-app-border bg-surface px-4 py-2 text-[10px] font-bold text-secondary"
            >
              <Camera size={15} /> Chụp ảnh
            </label>
          </div>
        </div>
      )}

      {uploading && images.length > 0 && (
        <p className="mt-3 flex items-center gap-2 text-[10px] text-muted">
          <LoaderCircle size={13} className="animate-spin" /> Đang xử lý ảnh…
        </p>
      )}
      {error && <p className="mt-3 text-xs text-rose-500">{error}</p>}
    </section>
  );
}
