import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, ViewChild, inject } from '@angular/core';

/**
 * Footer "kéo rèm" (curtain reveal): nội dung trang trượt lên, lộ footer cố định phía dưới.
 * Lấy ý tưởng từ Motion Footer (21st.dev): aurora động, lưới mờ, dải chữ chạy chéo, chữ PRINTIFY khổng lồ
 * trồi lên theo cuộn, nút "nam châm". Viết lại bằng Angular + CSS, không cần GSAP.
 * Trang dùng footer này bọc nội dung chính bằng class "curtain-content".
 */
@Component({
  selector: 'app-motion-footer',
  standalone: false,
  templateUrl: './motion-footer.html',
  styleUrl: './motion-footer.css',
})
export class MotionFooter implements AfterViewInit, OnDestroy {
  @ViewChild('giant') private giant?: ElementRef<HTMLElement>;
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private cleanup?: () => void;

  readonly year = new Date().getFullYear();
  readonly marquee = ['Make it yours', 'Áo thun', 'Cốc sứ', 'Túi tote', 'Sổ tay', 'Tranh canvas', 'Ốp lưng', 'Marketplace', 'In theo yêu cầu'];

  ngAfterViewInit(): void {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.zone.runOutsideAngular(() => {
      const el = this.host.nativeElement as HTMLElement;
      let raf = 0;
      const update = () => {
        raf = 0;
        const r = el.getBoundingClientRect();
        // 0 khi footer vừa chạm đáy màn hình, 1 khi đã lộ hết
        const p = Math.min(1, Math.max(0, (innerHeight - r.top) / Math.max(1, r.height)));
        el.style.setProperty('--reveal', p.toFixed(3));
      };
      const onScroll = () => (raf ||= requestAnimationFrame(update));
      addEventListener('scroll', onScroll, { passive: true });
      addEventListener('resize', onScroll);
      update();
      this.cleanup = () => {
        removeEventListener('scroll', onScroll);
        removeEventListener('resize', onScroll);
        cancelAnimationFrame(raf);
      };
    });
  }

  toTop(): void {
    scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  ngOnDestroy(): void {
    this.cleanup?.();
  }
}
