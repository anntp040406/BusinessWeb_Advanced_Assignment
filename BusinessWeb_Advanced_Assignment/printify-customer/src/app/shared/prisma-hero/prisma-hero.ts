import { AfterViewInit, Component, ElementRef, OnDestroy, computed, input, signal, viewChild } from '@angular/core';

export interface HeroNavItem {
  label: string;
  link: string;
  fragment?: string;
}

/**
 * Hero toàn màn hình: nền video/ảnh, chữ tiêu đề "kéo lên" từng từ, đoạn mô tả + nút kêu gọi.
 * Chuyển từ component React "PrismaHero" (framer-motion) sang Angular: hiệu ứng làm bằng CSS transition
 * + IntersectionObserver (chạy 1 lần khi hero vào màn hình), không cần thêm thư viện.
 * Người dùng bật "giảm chuyển động" trong hệ điều hành thì chữ hiện ngay, không chạy hiệu ứng.
 *
 * Dùng: <app-prisma-hero title="PrintiFy" [navItems]="nav" ctaLink="/products" videoSrc="/videos/hero.mp4" />
 */
@Component({
  selector: 'app-prisma-hero',
  standalone: false,
  templateUrl: './prisma-hero.html',
  styleUrl: './prisma-hero.css',
})
export class PrismaHero implements AfterViewInit, OnDestroy {
  readonly title = input('PrintiFy');
  /** Dấu * nhỏ sau từ cuối của tiêu đề */
  readonly showAsterisk = input(true);
  readonly description = input(
    'In áo, ly, túi theo thiết kế của riêng bạn. Tự thiết kế trên Editor, xem mẫu in thử trước khi in thật, hoặc chọn thiết kế từ cộng đồng trên Marketplace.',
  );
  readonly ctaLabel = input('Bắt đầu thiết kế');
  readonly ctaLink = input('/products');
  readonly navItems = input<HeroNavItem[]>([]);
  /** Video nền (nên để file trong public/, không dùng link ngoài). Không có thì dùng ảnh */
  readonly videoSrc = input<string | null>(null);
  readonly imageSrc = input('/dataset/images/products/placeholder.svg');
  /** Mô tả ảnh/video nền cho trình đọc màn hình; để trống nếu chỉ để trang trí */
  readonly mediaAlt = input('');

  readonly words = computed(() => this.title().split(' ').filter(Boolean));
  readonly shown = signal(false);

  private readonly root = viewChild.required<ElementRef<HTMLElement>>('root');
  private observer?: IntersectionObserver;

  ngAfterViewInit(): void {
    if (typeof IntersectionObserver === 'undefined') {
      this.shown.set(true);
      return;
    }
    this.observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        this.shown.set(true);
        this.observer?.disconnect();
      }
    });
    this.observer.observe(this.root().nativeElement);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  /** Từ thứ i trễ 80ms so với từ trước (giống bản gốc) */
  delay(i: number): string {
    return `${i * 80}ms`;
  }
}
