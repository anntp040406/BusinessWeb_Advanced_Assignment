
import { ChangeDetectorRef, Component, DestroyRef, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';

import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';

import {
  ActivatedRoute,
  Router,
  RouterLink
} from '@angular/router';

import { takeUntilDestroyed }
  from '@angular/core/rxjs-interop';

import { AuthService }
  from '../services/auth-service';

@Component({
  selector: 'app-register-component',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register-component.html',
  styleUrl: './register-component.css'
})
export class RegisterComponent {

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  /** App không dùng zone.js: báo Angular vẽ lại sau mỗi phản hồi HTTP */
  private readonly cdr = inject(ChangeDetectorRef);

  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.minLength(2),
        Validators.maxLength(100)
      ]
    }),

    email: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.email
      ]
    }),

    password: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.minLength(6)
      ]
    }),

    confirmPassword: new FormControl('', {
      nonNullable: true,
      validators: Validators.required
    })
  });

  readonly otpForm = new FormGroup({
    otpCode: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.pattern(/^[0-9]{6}$/)
      ]
    })
  });

  busy = false;
  submitted = false;
  otpSent = false;
  showPassword = false;

  errorMessage = '';
  otpError = '';
  /** Mã 6 số server tạo, hiện ngay trong popup để khách nhập lại */
  code = '';

  get returnUrl(): string {
    const url =
      this.route.snapshot.queryParamMap.get('returnUrl') || '/';

    if (
      !url.startsWith('/') ||
      url.startsWith('//') ||
      url.startsWith('/\\') ||
      url.startsWith('/auth/')
    ) {
      return '/';
    }

    return url;
  }

  requestOtp(): void {
    if (this.busy) return;

    this.submitted = true;
    this.errorMessage = '';

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const {
      name,
      email,
      password,
      confirmPassword
    } = this.form.getRawValue();

    if (password !== confirmPassword) {
      this.errorMessage =
        'Mật khẩu xác nhận không trùng khớp.';
      return;
    }

    this.busy = true;

    this.auth.requestOtp({
      name: name.trim(),
      email: email.trim(),
      password
    })
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe({
      next: (result) => {
        this.busy = false;
        this.cdr.markForCheck();
        this.otpSent = true;
        this.otpError = '';

        this.code = result.otp || '';

        this.otpForm.reset();
      },

      error: (error: HttpErrorResponse) => {
        this.busy = false;
        this.cdr.markForCheck();

        if (error.status === 409) {
          this.errorMessage =
            'Email đã tồn tại. Vui lòng đăng nhập.';
        } else if (error.status === 503) {
          this.errorMessage =
            'Hệ thống đang bận, bạn thử lại sau ít phút nhé.';
        } else if (error.status === 400) {
          this.errorMessage =
            'Thông tin chưa hợp lệ: mật khẩu cần ít nhất 6 ký tự.';
        } else {
          this.errorMessage =
            'Không thể đăng ký lúc này. Vui lòng thử lại.';
        }
      }
    });
  }

  verifyOtp(): void {
    if (this.busy || !this.otpSent) return;

    this.otpError = '';

    if (this.otpForm.invalid) {
      this.otpForm.markAllAsTouched();
      return;
    }

    this.busy = true;

    const email = this.form.controls.email.value.trim();
    const otp = this.otpForm.controls.otpCode.value;

    this.auth.verifyOtp(email, otp)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busy = false;
        this.cdr.markForCheck();
          this.otpSent = false;

          // Đăng ký thành công: quay về Homepage
          void this.router.navigateByUrl(this.returnUrl);
        },

        error: (error: HttpErrorResponse) => {
          this.busy = false;
        this.cdr.markForCheck();

          if (error.status === 400) {
            this.otpError =
              'Mã chưa đúng hoặc đã hết hạn. Bạn nhập lại mã hiện ở trên nhé.';
          } else if (error.status === 429) {
            this.otpError =
              'Bạn nhập sai quá nhiều lần. Hãy bấm Đăng ký lại để nhận mã mới.';
          } else {
            this.otpError =
              'Xác minh thất bại. Vui lòng thử lại.';
          }
        }
      });
  }

  closeOtp(): void {
    this.otpSent = false;
    this.otpError = '';
  }
}
