import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';

export interface AssistantLink {
  label: string;
  url: string;
}
export interface AssistantMessage {
  role: 'user' | 'bot';
  text: string;
  links?: AssistantLink[];
  related?: string[];
  error?: boolean;
  /** trợ lý không trả lời được -> hiện nút nhắn tư vấn viên */
  handoff?: boolean;
}
interface AssistantReply {
  answer: string;
  source: 'ai' | 'faq' | 'product' | 'fallback';
  links: AssistantLink[];
  related: string[];
  handoff: boolean;
}

const STORE = 'pf_assistant_v1';
const GREETING: AssistantMessage = {
  role: 'bot',
  text: 'Chào bạn, mình là trợ lý tự động của PrintiFy, trả lời ngay 24/7. Cần người thật hỗ trợ đơn hàng thì chọn tab Tư vấn viên nhé.',
};

/**
 * NV09 – Trợ lý AI/FAQ (tab "Trợ lý" của khung chat): gọi POST /api/assistant. Tab "Tư vấn viên" là chat CSKH (/api/chat). Server trả lời từ FAQ (và Gemini nếu server có khóa – khóa không bao giờ ở Angular).
 * Lịch sử hiện trên màn hình giữ trong sessionStorage của tab (đóng tab là mất), lịch sử gửi cho AI nằm trong session ở server.
 */
@Injectable({ providedIn: 'root' })
export class AssistantService {
  private readonly http = inject(HttpClient);

  readonly messages = signal<AssistantMessage[]>(this.restore());
  readonly starters = signal<string[]>([]);
  readonly ai = signal(false);
  readonly sending = signal(false);

  loadStarters(): void {
    if (this.starters().length) return;
    this.http.get<{ items: string[]; ai: boolean }>('/api/assistant/starters', { withCredentials: true }).subscribe({
      next: (r) => {
        this.starters.set(r.items);
        this.ai.set(r.ai);
      },
      error: () => this.starters.set(['Tôi thanh toán đơn hàng như thế nào?', 'Phí giao hàng là bao nhiêu?', 'Làm sao tự thiết kế sản phẩm?']),
    });
  }

  send(text: string): void {
    const message = text.trim().slice(0, 500);
    if (!message || this.sending()) return;
    this.push({ role: 'user', text: message });
    this.sending.set(true);
    this.http.post<AssistantReply>('/api/assistant', { message }, { withCredentials: true }).subscribe({
      next: (r) => {
        this.sending.set(false);
        this.push({ role: 'bot', text: r.answer, links: (r.links ?? []).filter((l) => l.url.startsWith('/') && !l.url.startsWith('//')), related: r.related ?? [], handoff: r.handoff });
      },
      error: (e: HttpErrorResponse) => {
        this.sending.set(false);
        const text = e.status === 429 || e.status === 400
          ? e.error?.message ?? 'Bạn thử lại sau ít phút nhé.'
          : 'Mình đang mất kết nối với máy chủ. Bạn thử lại sau, hoặc xem mục Hỏi đáp ở trang chủ nhé.';
        this.push({ role: 'bot', text, error: true });
      },
    });
  }

  reset(): void {
    this.messages.set([GREETING]);
    this.save();
    this.http.delete('/api/assistant', { withCredentials: true }).subscribe({ error: () => undefined });
  }

  private push(m: AssistantMessage): void {
    this.messages.update((list) => [...list, m].slice(-40));
    this.save();
  }

  private save(): void {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(this.messages()));
    } catch {
      /* trình duyệt chặn lưu: vẫn chat bình thường trong trang */
    }
  }

  private restore(): AssistantMessage[] {
    try {
      const list = JSON.parse(sessionStorage.getItem(STORE) || '[]') as AssistantMessage[];
      return Array.isArray(list) && list.length ? list : [GREETING];
    } catch {
      return [GREETING];
    }
  }
}
