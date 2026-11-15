import { Component, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { AdminAuthService } from '../../services/admin-auth.service';
import { ToastService } from '../../shared/toast.service';

export interface TeamMember {
  _id: string; name: string; email: string; role: 'STAFF' | 'SUPERADMIN'; admin_code: string | null;
  status: 'ACTIVE' | 'LOCKED' | string; lastLoginAt: string | null; createdAt: string | null;
  actions: number; ordersHandled30d: number; lastActionAt: string | null;
}
const API = '/api/admin/team';
const W = { withCredentials: true };

/**
 * Đội ngũ quản trị – chỉ SUPERADMIN thấy & dùng (route có adminRoleGuard, server cũng chặn 403).
 * Xem thành viên, thêm nhân viên, đổi vai trò, khóa / mở khóa, đặt lại mật khẩu.
 */
@Component({
  selector: 'app-admin-team',
  standalone: false,
  templateUrl: './admin-team.html',
  styleUrl: './admin-team.css',
})
export class AdminTeam {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  readonly auth = inject(AdminAuthService);

  readonly members = signal<TeamMember[]>([]);
  readonly loaded = signal(false);
  readonly q = signal('');
  readonly roleFilter = signal<'' | 'STAFF' | 'SUPERADMIN' | 'LOCKED'>('');
  readonly busyId = signal('');

  /** Hộp thoại: thêm thành viên / đặt lại mật khẩu / xác nhận khóa */
  readonly dialog = signal<null | { kind: 'add' } | { kind: 'password'; m: TeamMember } | { kind: 'lock'; m: TeamMember }>(null);
  readonly form = signal({ name: '', email: '', admin_code: '', role: 'STAFF' as 'STAFF' | 'SUPERADMIN', password: '' });
  readonly newPassword = signal('');
  readonly formError = signal('');

  readonly stats = computed(() => {
    const ms = this.members();
    return {
      total: ms.length,
      sa: ms.filter((m) => m.role === 'SUPERADMIN').length,
      staff: ms.filter((m) => m.role === 'STAFF').length,
      locked: ms.filter((m) => m.status !== 'ACTIVE').length,
    };
  });

  readonly list = computed(() => {
    const q = this.q().trim().toLowerCase();
    const f = this.roleFilter();
    return this.members().filter((m) =>
      (!f || (f === 'LOCKED' ? m.status !== 'ACTIVE' : m.role === f)) &&
      (!q || [m.name, m.email, m.admin_code ?? ''].some((x) => x.toLowerCase().includes(q))));
  });

  constructor() {
    this.load();
  }

  isMe(m: TeamMember): boolean {
    return m._id === this.auth.user()?._id;
  }

  initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return ((parts.at(-2)?.[0] ?? '') + (parts.at(-1)?.[0] ?? '')).toUpperCase();
  }

  load(): void {
    this.http.get<{ members: TeamMember[] }>(API, W).subscribe({
      next: (r) => { this.members.set(r.members); this.loaded.set(true); },
      error: (e: HttpErrorResponse) => { this.loaded.set(true); this.toast.show(e.error?.message || 'Không tải được danh sách đội ngũ.', false); },
    });
  }

  openAdd(): void {
    this.form.set({ name: '', email: '', admin_code: '', role: 'STAFF', password: '' });
    this.formError.set('');
    this.dialog.set({ kind: 'add' });
  }

  setForm(key: 'name' | 'email' | 'admin_code' | 'role' | 'password', value: string): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  submitAdd(): void {
    const f = this.form();
    if (f.name.trim().length < 2) return this.formError.set('Nhập họ tên (ít nhất 2 ký tự).');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return this.formError.set('Email chưa hợp lệ.');
    if (f.password.length < 6) return this.formError.set('Mật khẩu ít nhất 6 ký tự.');
    this.busyId.set('add');
    this.http.post<{ member: TeamMember; message: string }>(API, f, W).subscribe({
      next: (r) => {
        this.busyId.set('');
        this.members.update((ms) => [...ms, r.member]);
        this.dialog.set(null);
        this.toast.show(r.message);
      },
      error: (e: HttpErrorResponse) => { this.busyId.set(''); this.formError.set(e.error?.message || 'Không thêm được thành viên.'); },
    });
  }

  changeRole(m: TeamMember, role: string): void {
    if (role === m.role) return;
    this.patch(m, { role });
  }

  toggleLock(m: TeamMember): void {
    if (m.status === 'ACTIVE') this.dialog.set({ kind: 'lock', m });
    else this.patch(m, { status: 'ACTIVE' });
  }

  confirmLock(m: TeamMember): void {
    this.dialog.set(null);
    this.patch(m, { status: 'LOCKED' });
  }

  private patch(m: TeamMember, body: Record<string, string>): void {
    this.busyId.set(m._id);
    this.http.patch<{ member: TeamMember; message: string }>(`${API}/${m._id}`, body, W).subscribe({
      next: (r) => {
        this.busyId.set('');
        this.members.update((ms) => ms.map((x) => (x._id === m._id ? { ...x, ...r.member } : x)));
        this.toast.show(r.message);
      },
      error: (e: HttpErrorResponse) => {
        this.busyId.set('');
        this.members.update((ms) => [...ms]); // trả select về giá trị cũ
        this.toast.show(e.error?.message || 'Không lưu được thay đổi.', false);
      },
    });
  }

  openPassword(m: TeamMember): void {
    this.newPassword.set('');
    this.formError.set('');
    this.dialog.set({ kind: 'password', m });
  }

  submitPassword(m: TeamMember): void {
    if (this.newPassword().length < 6) return this.formError.set('Mật khẩu ít nhất 6 ký tự.');
    this.busyId.set(m._id);
    this.http.post<{ message: string }>(`${API}/${m._id}/password`, { password: this.newPassword() }, W).subscribe({
      next: (r) => { this.busyId.set(''); this.dialog.set(null); this.toast.show(r.message); },
      error: (e: HttpErrorResponse) => { this.busyId.set(''); this.formError.set(e.error?.message || 'Không đặt lại được mật khẩu.'); },
    });
  }
}
