import { Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { NavigationEnd, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { AuthService } from '../../services/auth-service';
import { AssistantService } from '../../services/assistant-service';

interface ChatMessage { _id: string; from: 'CUSTOMER' | 'STAFF'; text: string; author: string | null; at: string }
interface ChatThread { messages: ChatMessage[]; unreadByCustomer: number }
const W = { withCredentials: true };

/**
 * Khung chat PrintiFy (góc phải dưới, mọi trang trừ đăng nhập/editor) – 2 tab:
 *  - Trợ lý: trả lời tự động 24/7 từ FAQ + dữ liệu cửa hàng (+ Gemini nếu server có khóa). Ai cũng hỏi được. POST /api/assistant
 *  - Tư vấn viên: chat với nhân viên CSKH thật (cần đăng nhập). GET /api/chat, làm mới 3,5 giây (đang mở) / ~10 giây (đang đóng).
 * Trợ lý không trả lời được -> nút "Nhắn tư vấn viên" chuyển tab và điền sẵn câu hỏi.
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

  readonly assistant = inject(AssistantService);
  readonly open = signal(false);
  /** Tab đang mở: trợ lý tự động hoặc tư vấn viên */
  readonly tab = signal<'ai' | 'staff'>('ai');
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
    // trợ lý trả lời xong -> cuộn xuống
    effect(() => {
      this.assistant.messages();
      if (this.open() && this.tab() === 'ai') this.scrollDown();
    });
    // Đăng nhập/đăng xuất -> tải lại / xoá cuộc trò chuyện
    effect(() => {
      if (this.auth.user()) this.load(false);
      else this.thread.set(null);
    });
  }

  toggle(): void {
    this.open.update((v) => !v);
    if (!this.open()) return;
    // có tin nhân viên chưa đọc -> mở thẳng tab Tư vấn viên
    if (this.thread()?.unreadByCustomer) this.tab.set('staff');
    this.assistant.loadStarters();
    this.switchTab(this.tab());
  }

  switchTab(t: 'ai' | 'staff'): void {
    this.tab.set(t);
    this.error.set('');
    if (t === 'staff' && this.auth.user()) {
      this.load(true);
      this.markRead();
      const th = this.thread();
      if (th) this.thread.set({ ...th, unreadByCustomer: 0 });
    }
    else this.scrollDown();
  }

  /** Từ tab Trợ lý: chuyển sang tư vấn viên, điền sẵn câu khách vừa hỏi */
  handoff(): void {
    const lastQuestion = [...this.assistant.messages()].reverse().find((m) => m.role === 'user')?.text ?? '';
    this.draft.set(lastQuestion);
    this.switchTab('staff');
  }

  go(url: string): void {
    void this.router.navigateByUrl(url);
    if (matchMedia('(max-width: 480px)').matches) this.open.set(false);
  }

  private load(scroll: boolean): void {
    this.http.get<{ thread: ChatThread }>('/api/chat', W).subscribe({
      next: ({ thread }) => {
        const grew = thread.messages.length !== (this.thread()?.messages.length ?? 0);
        // chỉ tính là đã đọc khi khách đang xem tab Tư vấn viên
        const viewing = this.open() && this.tab() === 'staff';
        if (viewing && thread.unreadByCustomer) this.markRead();
        this.thread.set(viewing ? { ...thread, unreadByCustomer: 0 } : thread);
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
    if (this.tab() === 'ai') {
      if (!body || this.assistant.sending()) return;
      this.assistant.send(body);
      this.draft.set('');
      this.scrollDown();
      return;
    }
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

  readonly busy = computed(() => (this.tab() === 'ai' ? this.assistant.sending() : this.sending()));

  private scrollDown(): void {
    setTimeout(() => {
      const el = this.scroller()?.nativeElement;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
  }
}
