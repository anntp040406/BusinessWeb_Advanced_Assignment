import { Component, DestroyRef, HostListener, NgZone, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { CartService } from '../../services/cart-service';
import { AuthService } from '../../services/auth-service';

/** Thanh điều hướng chung: logo, menu, ô tìm kiếm, giỏ hàng, đăng nhập. Kính mờ, thu gọn khi cuộn. */
@Component({
  selector: 'app-navbar',
  standalone: false,
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
})
export class Navbar {
  readonly cart = inject(CartService);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Đã cuộn xuống -> thu gọn header, đổ bóng */
  readonly scrolled = signal(false);
  /** Thanh tiến độ đọc trang (0–1) */
  readonly progress = signal(0);

  /** Mục menu đang chọn, tính theo URL hiện tại */
  readonly active = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => this.section(e.urlAfterRedirects)),
    ),
    { initialValue: this.section(this.router.url) },
  );

  constructor() {
    const zone = inject(NgZone);
    let raf = 0;
    const update = () => {
      raf = 0;
      const y = scrollY;
      const max = document.documentElement.scrollHeight - innerHeight;
      zone.run(() => {
        this.scrolled.set(y > 12);
        this.progress.set(max > 0 ? Math.min(1, y / max) : 0);
      });
    };
    const onScroll = () => (raf ||= requestAnimationFrame(update));
    zone.runOutsideAngular(() => addEventListener('scroll', onScroll, { passive: true }));
    inject(DestroyRef).onDestroy(() => removeEventListener('scroll', onScroll));
  }

  /** Phím "/" để nhảy tới ô tìm kiếm */
  @HostListener('document:keydown', ['$event'])
  focusSearch(e: KeyboardEvent): void {
    const t = e.target as HTMLElement;
    if (e.key !== '/' || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable) return;
    const box = document.querySelector<HTMLInputElement>('app-navbar .header-search input');
    if (box) {
      e.preventDefault();
      box.focus();
    }
  }

  search(input: HTMLInputElement): void {
    const q = input.value.trim();
    this.router.navigate(['/products'], { queryParams: q ? { q } : {} });
  }

  logout(): void {
    this.auth.logout().subscribe({ next: () => this.router.navigateByUrl('/') });
  }

  /** Đường dẫn hiện tại, để đăng nhập xong quay lại đúng trang */
  get returnUrl(): string {
    return this.router.url.startsWith('/auth') ? '/' : this.router.url;
  }

  private section(url: string): string {
    if (url.startsWith('/products')) return 'products';
    if (url.startsWith('/market')) return 'market';
    // Về chúng tôi nằm trong trang chủ (#about)
    if (url.startsWith('/about') || url.startsWith('/#about')) return 'home';
    if (url.startsWith('/survey')) return 'survey';
    return url === '/' || url.startsWith('/#') ? 'home' : '';
  }
}
