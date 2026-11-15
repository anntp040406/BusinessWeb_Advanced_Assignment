import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AdminAuthService } from '../../services/admin-auth.service';
import { AdminDataService } from '../../services/admin-data.service';
import { AdminNotification, AdminNotificationService } from '../../services/admin-notification.service';
import { AdminChatService } from '../../services/admin-chat.service';
import { ToastService } from '../../shared/toast.service';
import { confirmSubOf } from '../../models/labels';

/** Bố cục dùng chung: sidebar thu gọn được + header (chat CSKH, chuông thông báo, tài khoản) */
@Component({
  selector: 'app-admin-layout',
  standalone: false,
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.css',
})
export class AdminLayout {
  readonly auth = inject(AdminAuthService);
  readonly data = inject(AdminDataService);
  readonly notes = inject(AdminNotificationService);
  readonly chat = inject(AdminChatService);
  readonly toast = inject(ToastService).toast;
  private readonly router = inject(Router);

  readonly bellOpen = signal(false);
  readonly menuOpen = signal(false);
  /** Thu gọn sidebar thành thanh icon (nhớ theo trình duyệt) */
  readonly collapsed = signal(this.readRail());

  constructor() {
    this.chat.start(inject(DestroyRef));
  }

  toggleRail(): void {
    this.collapsed.update((v) => !v);
    try { localStorage.setItem('pf.admin.rail', this.collapsed() ? '1' : '0'); } catch { /* bỏ qua */ }
  }

  private readRail(): boolean {
    try { return localStorage.getItem('pf.admin.rail') === '1'; } catch { return false; }
  }
  readonly latest = computed(() => this.notes.all().slice(0, 5));

  /** Số việc chờ hiện trên sidebar */
  readonly waitingOrders = computed(() => this.data.orders().filter((o) => {
    const s = confirmSubOf(o);
    return s === 'payment_review' || s === 'design_review' || s === 'cancel_request';
  }).length);
  readonly pendingListings = computed(() => this.data.listings().filter((l) => l.status === 'PENDING_REVIEW').length + this.data.reports().filter((r) => r.status === 'OPEN').length);

  readonly nav = [
    { link: '/admin/homepage', icon: 'home', label: 'Tổng quan', code: 'D0' },
    { link: '/admin/products-list', icon: 'shirt', label: 'Sản phẩm', code: 'D3' },
    { link: '/admin/orders-list', icon: 'box', label: 'Đơn hàng', code: 'D5' },
    { link: '/admin/marketplace', icon: 'palette', label: 'Marketplace', code: 'D7' },
    { link: '/admin/chat', icon: 'chat', label: 'Hỗ trợ khách hàng', code: 'CS' },
    { link: '/admin/notifications', icon: 'bell', label: 'Thông báo', code: 'D9' },
  ];

  badgeFor(code: string): number {
    if (code === 'D5') return this.waitingOrders();
    if (code === 'D7') return this.pendingListings();
    if (code === 'D9') return this.notes.unreadCount();
    if (code === 'CS') return this.chat.unread();
    return 0;
  }

  open(n: AdminNotification): void {
    this.notes.markRead(n.id);
    this.bellOpen.set(false);
    this.router.navigate(n.link, { queryParams: n.query });
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/admin/login']);
  }
}
