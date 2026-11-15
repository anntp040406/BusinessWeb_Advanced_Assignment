import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

const W = { withCredentials: true };

export interface ChatMessage { _id: string; from: 'CUSTOMER' | 'STAFF'; text: string; author: string | null; at: string }
export interface ChatThread {
  _id: string; userId: string; userName: string; userEmail: string;
  unreadByStaff: number; unreadByCustomer: number; updatedAt: string;
  messages?: ChatMessage[];
  lastMessage?: { from: string; text: string; at: string } | null;
}

/** Hộp thư CSKH: danh sách cuộc trò chuyện, tự làm mới 5 giây/lần */
@Injectable({ providedIn: 'root' })
export class AdminChatService {
  private readonly http = inject(HttpClient);
  readonly threads = signal<ChatThread[]>([]);
  readonly unread = computed(() => this.threads().reduce((s, t) => s + (t.unreadByStaff ? 1 : 0), 0));
  private timer?: ReturnType<typeof setInterval>;

  start(destroy: DestroyRef): void {
    this.refresh();
    clearInterval(this.timer);
    this.timer = setInterval(() => this.refresh(), 5000);
    destroy.onDestroy(() => clearInterval(this.timer));
  }

  refresh(): void {
    this.http.get<{ threads: ChatThread[] }>('/api/admin/chat', W).subscribe({ next: (r) => this.threads.set(r.threads), error: () => {} });
  }

  thread(userId: string) {
    return this.http.get<{ thread: ChatThread }>(`/api/admin/chat/${encodeURIComponent(userId)}`, W);
  }

  send(userId: string, text: string) {
    return this.http.post<{ thread: ChatThread }>(`/api/admin/chat/${encodeURIComponent(userId)}/messages`, { text }, W);
  }

  markRead(userId: string): void {
    this.threads.update((ts) => ts.map((t) => (t.userId === userId ? { ...t, unreadByStaff: 0 } : t)));
    this.http.post(`/api/admin/chat/${encodeURIComponent(userId)}/read`, {}, W).subscribe({ error: () => {} });
  }
}
