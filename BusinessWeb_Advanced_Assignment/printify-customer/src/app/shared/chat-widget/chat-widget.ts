import { Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { NavigationEnd, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { AuthService } from '../../services/auth-service';

interface ChatMessage { _id: string; from: 'CUSTOMER' | 'STAFF'; text: string; author: string | null; at: string }
interface ChatThread { messages: ChatMessage[]; unreadByCustomer: number }
const W = { withCredentials: true };

/**
 * Bong bóng chat với CSKH PrintiFy (góc phải dưới, mọi trang trừ đăng nhập/editor).
 * Chưa đăng nhập -> mời đăng nhập. Đã đăng nhập -> GET /api/chat, làm mới 4 giây (đang mở) / 10 giây (đang đóng).
 */
@Component({
  selector: 'app-chat-widget',
  standalone: false,
  templateUrl: './chat-widget.html',
  styleUrl: './chat-widget.css',
})
export class ChatWidget {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  readonly open = signal(false);
  readonly thread = signal<ChatThread | null>(null);
  readonly draft = signal('');
  readonly sending = signal(false);
  readonly error = signal('');
  readonly unread = computed(() => (this.open() ? 0 : this.thread()?.unreadByCustomer ?? 0));

  private readonly url = toSignal(
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), map((e) => e.urlAfterRedirects)),
    { initialValue: this.router.url },
  );
  readonly hidden = computed(() => this.url().startsWith('/auth') || this.url().includes('editor'));
  get returnUrl(): string { return this.url(); }

  readonly suggestions = ['Đơn hàng của tôi đang ở đâu?', 'Tôi muốn đổi địa chỉ giao hàng', 'File thiết kế cần độ phân giải bao nhiêu?'];

  constructor() {
    let tick = 0;
    const timer = setInterval(() => {
      tick++;
      if (this.auth.user() && (this.open() || tick % 3 === 0)) this.load(false);
    }, 3500);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    // Đăng nhập/đăng xuất -> tải lại / xoá cuộc trò chuyện
    effect(() => {
      if (this.auth.user()) this.load(false);
      else this.thread.set(null);
    });
  }

  toggle(): void {
    this.open.update((v) => !v);
    if (this.open() && this.auth.user()) { this.load(true); this.markRead(); }
  }

  private load(scroll: boolean): void {
    this.http.get<{ thread: ChatThread }>('/api/chat', W).subscribe({
      next: ({ thread }) => {
        const grew = thread.messages.length !== (this.thread()?.messages.length ?? 0);
        this.thread.set(thread);
        if (this.open() && thread.unreadByCustomer) this.markRead();
        if (scroll || (grew && this.open())) this.scrollDown();
      },
      error: () => {},
    });
  }

  private markRead(): void {
    this.http.post('/api/chat/read', {}, W).subscribe({ error: () => {} });
  }

  send(text = this.draft()): void {
    const body = text.trim();
    if (!body || this.sending()) return;
    this.sending.set(true);
    this.error.set('');
    this.http.post<{ thread: ChatThread }>('/api/chat/messages', { text: body }, W).subscribe({
      next: ({ thread }) => { this.thread.set(thread); this.draft.set(''); this.sending.set(false); this.scrollDown(); },
      error: (e) => { this.sending.set(false); this.error.set(e?.error?.message || 'Gửi chưa được, bạn thử lại nhé.'); },
    });
  }

  onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
  }

  private scrollDown(): void {
    setTimeout(() => {
      const el = this.scroller()?.nativeElement;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
  }
}
