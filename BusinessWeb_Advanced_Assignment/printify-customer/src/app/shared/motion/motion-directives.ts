import { AfterViewInit, Directive, ElementRef, Input, NgZone, OnDestroy, inject } from '@angular/core';

const reduceMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Hiện dần khi cuộn tới (IntersectionObserver, chạy 1 lần).
 * <div appReveal="up" [revealDelay]="120"> – kiểu: up | down | left | right | zoom | fade
 * Tôn trọng prefers-reduced-motion (hiện ngay, không chuyển động).
 */
@Directive({ selector: '[appReveal]', standalone: true })
export class RevealDirective implements AfterViewInit, OnDestroy {
  @Input('appReveal') kind: '' | 'up' | 'down' | 'left' | 'right' | 'zoom' | 'fade' = 'up';
  @Input() revealDelay = 0;
  private readonly el = inject(ElementRef<HTMLElement>);
  private io?: IntersectionObserver;

  ngAfterViewInit(): void {
    const node = this.el.nativeElement;
    node.classList.add('reveal', 'reveal-' + (this.kind || 'up'));
    node.style.setProperty('--reveal-delay', this.revealDelay + 'ms');
    if (reduceMotion() || typeof IntersectionObserver === 'undefined') {
      node.classList.add('is-visible');
      return;
    }
    this.io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            node.classList.add('is-visible');
            this.io?.disconnect();
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );
    this.io.observe(node);
  }

  ngOnDestroy(): void {
    this.io?.disconnect();
  }
}

/**
 * Nút "nam châm": bám nhẹ theo con trỏ khi rê gần, thả ra thì bật về (overshoot).
 * <a appMagnetic [magnetStrength]="0.35">
 */
@Directive({ selector: '[appMagnetic]', standalone: true })
export class MagneticDirective implements AfterViewInit, OnDestroy {
  @Input() magnetStrength = 0.3;
  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private off: (() => void)[] = [];

  ngAfterViewInit(): void {
    if (reduceMotion() || matchMedia('(hover: none)').matches) return;
    const node = this.el.nativeElement;
    node.classList.add('magnetic');
    this.zone.runOutsideAngular(() => {
      const move = (e: PointerEvent) => {
        const r = node.getBoundingClientRect();
        const x = (e.clientX - (r.left + r.width / 2)) * this.magnetStrength;
        const y = (e.clientY - (r.top + r.height / 2)) * this.magnetStrength;
        node.style.transform = `translate(${x}px, ${y}px)`;
      };
      const leave = () => (node.style.transform = '');
      node.addEventListener('pointermove', move);
      node.addEventListener('pointerleave', leave);
      this.off.push(() => node.removeEventListener('pointermove', move), () => node.removeEventListener('pointerleave', leave));
    });
  }

  ngOnDestroy(): void {
    this.off.forEach((f) => f());
  }
}

/**
 * Đếm số từ 0 khi phần tử xuất hiện. <b [appCountUp]="42" countSuffix="+"></b>
 */
@Directive({ selector: '[appCountUp]', standalone: true })
export class CountUpDirective implements AfterViewInit, OnDestroy {
  @Input('appCountUp') set value(v: number | null | undefined) {
    this.target = Number(v) || 0;
    if (this.started) this.render(this.target);
  }
  @Input() countSuffix = '';
  @Input() countDuration = 1400;
  private target = 0;
  private started = false;
  private readonly el = inject(ElementRef<HTMLElement>);
  private io?: IntersectionObserver;
  private raf = 0;

  ngAfterViewInit(): void {
    this.render(0);
    if (reduceMotion() || typeof IntersectionObserver === 'undefined') {
      this.started = true;
      this.render(this.target);
      return;
    }
    this.io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      this.io?.disconnect();
      this.started = true;
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / this.countDuration);
        const eased = 1 - Math.pow(1 - p, 3);
        this.render(Math.round(this.target * eased));
        if (p < 1) this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    });
    this.io.observe(this.el.nativeElement);
  }

  private render(n: number): void {
    this.el.nativeElement.textContent = new Intl.NumberFormat('vi-VN').format(n) + this.countSuffix;
  }

  ngOnDestroy(): void {
    this.io?.disconnect();
    cancelAnimationFrame(this.raf);
  }
}

/**
 * Nghiêng 3D nhẹ theo con trỏ (thẻ sản phẩm / ảnh hero). <div appTilt [tiltMax]="8">
 */
@Directive({ selector: '[appTilt]', standalone: true })
export class TiltDirective implements AfterViewInit, OnDestroy {
  @Input() tiltMax = 7;
  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private off: (() => void)[] = [];

  ngAfterViewInit(): void {
    if (reduceMotion() || matchMedia('(hover: none)').matches) return;
    const node = this.el.nativeElement;
    node.classList.add('tilt');
    this.zone.runOutsideAngular(() => {
      const move = (e: PointerEvent) => {
        const r = node.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        node.style.transform = `perspective(900px) rotateX(${(-py * this.tiltMax).toFixed(2)}deg) rotateY(${(px * this.tiltMax).toFixed(2)}deg)`;
        node.style.setProperty('--mx', `${(px + 0.5) * 100}%`);
        node.style.setProperty('--my', `${(py + 0.5) * 100}%`);
      };
      const leave = () => (node.style.transform = '');
      node.addEventListener('pointermove', move);
      node.addEventListener('pointerleave', leave);
      this.off.push(() => node.removeEventListener('pointermove', move), () => node.removeEventListener('pointerleave', leave));
    });
  }

  ngOnDestroy(): void {
    this.off.forEach((f) => f());
  }
}

export const MOTION = [RevealDirective, MagneticDirective, CountUpDirective, TiltDirective] as const;
