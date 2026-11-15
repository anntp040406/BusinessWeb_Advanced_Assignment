/**
 * Uốn thiết kế phẳng theo hình dáng sản phẩm để xem trước giống thật (không cần WebGL):
 *  - 'cylinder' : ly, cốc, bình nước – hình ôm quanh thân trụ: giữa rộng, 2 mép bị nén lại,
 *                 mép trên/dưới cong theo vành elip.
 *  - 'pillow'   : vỏ gối – phồng ở giữa, 4 cạnh co vào.
 * Sáng tối lấy từ chính ảnh sản phẩm (vẽ bằng blend multiply).
 *  - 'flat'     : giữ nguyên (áo, túi, sổ, tranh...).
 * Vẽ bằng cách cắt ảnh thành từng dải 1px rồi đặt lại vị trí (canvas 2D).
 */
export type WarpKind = 'cylinder' | 'pillow' | 'flat';

interface ProductLike { _id?: string; category?: string; name?: string }

/** Loại uốn theo sản phẩm */
export function warpKindOf(p: ProductLike | null | undefined): WarpKind {
  if (!p) return 'flat';
  const name = (p.name ?? '').toLowerCase();
  if (p.category === 'binh-nuoc' || /cốc|ly |ly$|bình/.test(name)) return 'cylinder';
  if (/gối/.test(name)) return 'pillow';
  return 'flat';
}

export interface Rect { x: number; y: number; w: number; h: number }

/** Góc nửa thân trụ nhìn thấy (rad): càng lớn càng "ôm" mạnh */
const CYL_ANGLE = 1.05;
/** Độ cong vành trên/dưới so với chiều cao vùng in */
const CYL_SAG = 0.06;

/**
 * Vẽ art (đã fit sẵn đúng kích thước rect) lên ctx tại rect, có uốn theo kind.
 * ctx nên dùng globalCompositeOperation 'multiply' để hình "ăn" vào bề mặt sản phẩm.
 */
export function drawWarped(ctx: CanvasRenderingContext2D, art: CanvasImageSource & { width: number; height: number }, rect: Rect, kind: WarpKind): void {
  const { x, y, w, h } = rect;
  if (w < 2 || h < 2) return;
  if (kind === 'flat') {
    ctx.drawImage(art, x, y, w, h);
    return;
  }
  const sw = art.width, sh = art.height;
  const tmp = document.createElement('canvas');
  tmp.width = Math.ceil(w);
  tmp.height = Math.ceil(h * (kind === 'cylinder' ? 1 + CYL_SAG * 2 : 1));
  const t = tmp.getContext('2d')!;
  t.imageSmoothingQuality = 'high';

  if (kind === 'cylinder') {
    const sinA = Math.sin(CYL_ANGLE);
    const sag = h * CYL_SAG;
    for (let i = 0; i < tmp.width; i++) {
      const u = ((i + 0.5) / tmp.width) * 2 - 1;          // vị trí trên màn hình: -1..1
      const theta = Math.asin(Math.max(-1, Math.min(1, u * sinA))); // góc trên thân trụ
      const s = (theta / CYL_ANGLE + 1) / 2;               // vị trí trên ảnh phẳng: 0..1
      const sx = Math.min(sw - 1, Math.max(0, s * sw));
      const dy = sag * (1 - Math.cos(theta)) / (1 - Math.cos(CYL_ANGLE)); // mép xuống thấp hơn như vành elip
      t.drawImage(art, sx, 0, Math.max(1, sw / tmp.width), sh, i, sag + dy - sag * 0.5, 1, h);
    }
    // Không tô bóng thêm: ảnh sản phẩm đã có sáng tối thật, blend multiply sẽ giữ lại bóng đó
    ctx.drawImage(tmp, x, y - sag, tmp.width, tmp.height);
    return;
  }

  // pillow: co 4 cạnh vào (2 lượt: theo hàng rồi theo cột), phồng ở giữa
  const pinch = 0.07;
  const rowPass = document.createElement('canvas');
  rowPass.width = tmp.width; rowPass.height = tmp.height;
  const r = rowPass.getContext('2d')!;
  for (let j = 0; j < tmp.height; j++) {
    const v = ((j + 0.5) / tmp.height) * 2 - 1;
    const k = 1 - pinch * v * v * 2;                       // hàng sát mép trên/dưới hẹp hơn
    const rw = tmp.width * k;
    r.drawImage(art, 0, (j / tmp.height) * sh, sw, Math.max(1, sh / tmp.height), (tmp.width - rw) / 2, j, rw, 1);
  }
  for (let i = 0; i < tmp.width; i++) {
    const u = ((i + 0.5) / tmp.width) * 2 - 1;
    const k = 1 - pinch * u * u * 2;                       // cột sát mép trái/phải thấp hơn
    const ch = tmp.height * k;
    t.drawImage(rowPass, i, 0, 1, tmp.height, i, (tmp.height - ch) / 2, 1, ch);
  }
  ctx.drawImage(tmp, x, y, tmp.width, tmp.height);
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => ok(img);
    img.onerror = fail;
    img.src = src;
  });
}

/** Fit "contain" ảnh vào khung w×h, trả canvas đúng kích thước khung (nền trong suốt) */
export function fitContain(img: HTMLImageElement | HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const s = Math.min(c.width / img.width, c.height / img.height);
  const dw = img.width * s, dh = img.height * s;
  c.getContext('2d')!.drawImage(img, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
  return c;
}

/**
 * Ghép ảnh sản phẩm (nền) + file in (trong suốt, đúng khung vùng in) có uốn -> dataURL JPEG.
 * bgSrc và artSrc là ảnh cùng hệ toạ độ size×size; rect = vùng in theo hệ đó.
 */
export async function composeWarped(bgSrc: string, artSrc: string, rect: Rect, kind: WarpKind, size: number, quality = 0.88): Promise<string> {
  const [bg, art] = await Promise.all([loadImage(bgSrc), loadImage(artSrc)]);
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(bg, 0, 0, size, size);
  ctx.globalCompositeOperation = 'multiply';
  drawWarped(ctx, fitContain(art, rect.w, rect.h), rect, kind);
  ctx.globalCompositeOperation = 'source-over';
  return c.toDataURL('image/jpeg', quality);
}
