import { Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminChatService, ChatThread } from '../../services/admin-chat.service';
import { ToastService } from '../../shared/toast.service';

/** Hỗ trợ khách hàng (CSKH): danh sách cuộc trò chuyện + khung chat, tự làm mới 4 giây/lần */
@Component({
  selector: 'app-admin-chat',
  standalone: false,
  templateUrl: './admin-chat.html',
  styleUrl: './admin-chat.css',
})
export class AdminChat {
  readonly chat = inject(AdminChatService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  readonly q = signal('');
  readonly onlyUnread = signal(false);
  readonly activeId = signal<string | null>(inject(ActivatedRoute).snapshot.queryParamMap.get('u'));
  readonly thread = signal<ChatThread | null>(null);
  readonly draft = signal('');
  readonly sending = signal(false);

  readonly list = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.chat.threads().filter((t) =>
      (!this.onlyUnread() || t.unreadByStaff > 0) && (!q || t.userName.toLowerCase().includes(q) || t.userEmail.toLowerCase().includes(q)));
  });

  readonly quick = [
    'Chào bạn, PrintiFy đã nhận được tin nhắn và đang kiểm tra giúp bạn nhé!',
    'Bạn cho mình xin mã đơn hàng để kiểm tra nhanh hơn nhé.',
    'Đơn của bạn đang được in, dự kiến giao trong 2–3 ngày tới.',
    'Cảm ơn bạn đã liên hệ PrintiFy!',
  ];

  constructor() {
    const timer = setInterval(() => this.load(false), 4000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    effect(() => {
      const id = this.activeId();
      if (id) this.load(true);
    });
  }

  select(t: ChatThread): void {
    if (this.activeId() === t.userId) return;
    this.thread.set(null);
    this.activeId.set(t.userId);
    this.router.navigate([], { queryParams: { u: t.userId }, replaceUrl: true });
  }

  private load(scroll: boolean): void {
    const id = this.activeId();
    if (!id) return;
    this.chat.thread(id).subscribe({
      next: ({ thread }) => {
        if (this.activeId() !== id) return;
        const grew = (thread.messages?.length ?? 0) !== (this.thread()?.messages?.length ?? 0);
        this.thread.set(thread);
        if (thread.unreadByStaff) this.chat.markRead(id);
        if (scroll || grew) this.scrollDown();
      },
      error: () => { if (scroll) this.toast.show('Không tải được cuộc trò chuyện.', false); },
    });
  }

  send(text = this.draft()): void {
    const id = this.activeId();
    const body = text.trim();
    if (!id || !body || this.sending()) return;
    this.sending.set(true);
    this.chat.send(id, body).subscribe({
      next: ({ thread }) => {
        this.thread.set(thread);
        this.draft.set('');
        this.sending.set(false);
        this.chat.refresh();
        this.scrollDown();
      },
      error: (e) => { this.sending.set(false); this.toast.show(e?.error?.message || 'Gửi tin nhắn thất bại.', false); },
    });
  }

  onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
  }

  /** Có hiện mốc ngày trước tin thứ i không */
  dayBreak(i: number): string | null {
    const ms = this.thread()?.messages ?? [];
    const d = new Date(ms[i].at).toDateString();
    if (i > 0 && new Date(ms[i - 1].at).toDateString() === d) return null;
    return new Date(ms[i].at).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  private scrollDown(): void {
    setTimeout(() => {
      const el = this.scroller()?.nativeElement;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
  }
}
