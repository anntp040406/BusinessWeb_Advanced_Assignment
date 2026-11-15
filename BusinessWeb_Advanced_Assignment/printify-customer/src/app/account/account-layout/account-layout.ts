import { Component, OnInit, inject } from '@angular/core';
import { AuthService } from '../../services/auth-service';
import { ProfileService } from '../../services/profile-service';
import { NotificationService } from '../../services/notification-service';
import { membershipOf } from '../../models/membership.model';

interface MenuItem {
  label: string;
  icon: string;
  link: string;
  code: string;
}

/** Khung trang tài khoản: navbar + sidebar (C18 dùng chung cho C11, C14, C19...) */
@Component({
  selector: 'app-account-layout',
  standalone: false,
  templateUrl: './account-layout.html',
  styleUrl: './account-layout.css',
})
export class AccountLayout implements OnInit {
  readonly auth = inject(AuthService);
  readonly profiles = inject(ProfileService);
  readonly notifications = inject(NotificationService);

  tierOf(spent = 0) {
    return membershipOf(spent).tier;
  }

  readonly menu: MenuItem[] = [
    { label: 'Hồ sơ & địa chỉ', icon: 'user', link: '/account/profile', code: 'C18' },
    { label: 'Thiết kế của tôi', icon: 'palette', link: '/account/designs', code: 'C11' },
    { label: 'Đơn hàng của tôi', icon: 'package', link: '/account/orders', code: 'C14' },
    { label: 'Thông báo', icon: 'bell', link: '/account/notifications', code: 'C19' },
    { label: 'Tin đăng Marketplace', icon: 'tag', link: '/market/my-listings', code: 'C20' },
    { label: 'Khảo sát', icon: 'clipboard', link: '/survey-question', code: 'C23' },
  ];

  ngOnInit(): void {
    void this.profiles.load();
  }

  initial(name: string | undefined): string {
    return (name || '?').trim().charAt(0).toUpperCase();
  }
}
