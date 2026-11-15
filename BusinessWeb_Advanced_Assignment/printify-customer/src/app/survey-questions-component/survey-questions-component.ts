import { ChangeDetectorRef, Component, DestroyRef, HostListener, inject, OnInit } from '@angular/core';
import { SurveyQuestService } from '../services/survey-quest-service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormRecord,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { SurveyQuestion, SurveyQuestionsResponse, TamDimension } from '../models/survey.model';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';

type QuestionGroup = { code: TamDimension; title: string; questions: SurveyQuestion[] };

@Component({
  selector: 'app-survey-questions-component',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, DatePipe, DecimalPipe],
  styleUrl: './survey-questions-component.css',
  templateUrl: './survey-questions-component.html',
})

export class SurveyQuestionsComponent implements OnInit {
  private readonly api = inject(SurveyQuestService);
  private readonly destroyRef = inject(DestroyRef);
  /** App chạy không có zone.js: báo Angular vẽ lại sau mỗi phản hồi HTTP */
  private readonly cdr = inject(ChangeDetectorRef);

  readonly scale = [1, 2, 3, 4, 5];
  /** Nhãn thang Likert hiển thị trên từng lựa chọn */
  readonly scaleLabels = ['Hoàn toàn không đồng ý', 'Không đồng ý', 'Trung lập', 'Đồng ý', 'Hoàn toàn đồng ý'];
  readonly scaleHints = ['Rất chưa hài lòng với điểm này', '', 'Không rõ / bình thường', '', 'Rất đúng với trải nghiệm của tôi'];
  /** Bước đang hiện: 0..n-1 là câu hỏi, n là bước góp ý + gửi */
  step = 0;
  /** Hướng chuyển bước để chạy hiệu ứng trượt */
  dir: 'next' | 'back' = 'next';
  private advanceTimer?: ReturnType<typeof setTimeout>;
  readonly ratings = new FormRecord<FormControl<number | null>>({});
  readonly comment = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(500)]
  });

  readonly groups: QuestionGroup[] = [
    { code: 'PU', title: 'Tính hữu ích', questions: [] },
    { code: 'EOU', title: 'Tính dễ sử dụng', questions: [] },
    { code: 'SAT', title: 'Sự hài lòng', questions: [] },
    { code: 'PI', title: 'Ý định mua hàng', questions: [] }
  ];

  status: SurveyQuestionsResponse | null = null;
  questions: SurveyQuestion[] = [];
  loading = true;
  submitting = false;
  submitted = false;
  /** Đã làm tháng này nhưng muốn làm phiếu mới */
  retake = false;
  showValidation = false;
  loadError = '';
  submitError = '';

  ngOnInit(): void {
    this.loadQuestions();
  }

  loadQuestions(): void {
    this.loading = true;
    this.loadError = '';
    this.status = null;
    this.submitted = false;
    this.retake = false;
    this.showValidation = false;
    this.submitError = '';
    this.comment.reset('');
    this.step = 0;
    this.api.getQuestions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.status = response;
          this.questions = response.questions
            .filter(q => q.isActive)
            .sort((a, b) => a.orderIndex - b.orderIndex);

          // Reset controls when retrying the GET.
          for (const key of Object.keys(this.ratings.controls)) {
            this.ratings.removeControl(key);
          }
          for (const group of this.groups) {
            group.questions = this.questions.filter(q => q.dimension === group.code);
          }
          for (const question of this.questions) {
            this.ratings.addControl(
              question._id,
              new FormControl<number | null>(null, Validators.required)
            );
          }
          if (!response.canSubmit) this.ratings.disable();
          else this.ratings.enable();
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (error: HttpErrorResponse) => {
          this.loadError = error.status === 401
            ? 'Vui lòng đăng nhập tài khoản Customer để tham gia khảo sát.'
            : error.status === 403
              ? 'Tài khoản hiện không có quyền tham gia khảo sát.'
              : 'Không tải được khảo sát. Hãy kiểm tra kết nối và thử lại.';
          this.loading = false;
          this.cdr.markForCheck();
        }
      });
  }

  get answeredCount(): number {
    return this.questions.filter(q => this.ratings.get(q._id)?.value !== null).length;
  }

  /** "2026-11" -> "tháng 11/2026" */
  periodLabel(p: string | undefined | null): string {
    if (!p) return '';
    const [y, m] = p.split('-');
    return `tháng ${Number(m)}/${y}`;
  }

  /** Hiện form: chưa làm tháng này, hoặc khách chủ động làm phiếu mới */
  get showForm(): boolean {
    return !!this.status?.canSubmit && (!this.status.respondedThisPeriod || this.retake);
  }

  startRetake(): void {
    this.retake = true;
    this.step = 0;
    this.ratings.reset();
    this.ratings.enable();
    this.comment.reset('');
    this.showValidation = false;
    setTimeout(() => document.querySelector('.sv-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  // ---------------- Thẻ hỏi từng câu ----------------
  get total(): number { return this.questions.length; }
  get onComment(): boolean { return this.step >= this.total; }
  get current(): SurveyQuestion | undefined { return this.questions[this.step]; }
  get currentGroup(): QuestionGroup | undefined { return this.groups.find((g) => g.code === this.current?.dimension); }
  get groupIndex(): number { return this.groups.findIndex((g) => g.code === this.current?.dimension); }
  valueOf(q: SurveyQuestion | undefined): number | null { return q ? this.ratings.get(q._id)?.value ?? null : null; }
  /** Đoạn tiến độ của từng nhóm: phần trăm đã trả lời */
  groupProgress(g: QuestionGroup): number {
    if (!g.questions.length) return 0;
    return (g.questions.filter((q) => this.valueOf(q) !== null).length / g.questions.length) * 100;
  }

  pick(score: number): void {
    const q = this.current;
    if (!q || this.submitting) return;
    this.ratings.get(q._id)?.setValue(score);
    this.submitError = '';
    clearTimeout(this.advanceTimer);
    // chọn xong tự sang câu kế (trễ nhẹ để thấy lựa chọn)
    this.advanceTimer = setTimeout(() => { this.next(); this.cdr.markForCheck(); }, 260);
  }

  next(): void {
    clearTimeout(this.advanceTimer);
    if (this.onComment) { this.submitSurvey(); return; }
    if (this.valueOf(this.current) === null) { this.submitError = 'Chọn một mức từ 1 đến 5 để tiếp tục nhé.'; return; }
    this.dir = 'next';
    this.step = this.firstUnanswered(this.step + 1);
  }

  back(): void {
    clearTimeout(this.advanceTimer);
    if (this.step === 0) return;
    this.dir = 'back';
    this.submitError = '';
    this.step--;
  }

  goTo(i: number): void {
    clearTimeout(this.advanceTimer);
    this.dir = i < this.step ? 'back' : 'next';
    this.submitError = '';
    this.step = i;
  }

  /** Câu chưa trả lời đầu tiên từ vị trí from (hết thì sang bước góp ý) */
  private firstUnanswered(from: number): number {
    for (let i = from; i < this.total; i++) if (this.valueOf(this.questions[i]) === null) return i;
    for (let i = 0; i < from && i < this.total; i++) if (this.valueOf(this.questions[i]) === null) return i;
    return this.total;
  }

  /** Phím 1–5 chọn, Enter = tiếp, ← = quay lại (không bắt khi đang gõ góp ý) */
  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (!this.showForm || this.submitted || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT') return;
    if (!this.onComment && /^[1-5]$/.test(e.key)) { e.preventDefault(); this.pick(Number(e.key)); }
    else if (e.key === 'Enter') { e.preventDefault(); this.next(); }
    else if (e.key === 'ArrowLeft' || e.key === 'Backspace') { e.preventDefault(); this.back(); }
  }

  get blockMessage(): string {
    switch (this.status?.reason) {
      case 'ALREADY_RESPONDED':
        return 'Bạn đã làm khảo sát ' + this.periodLabel(this.status?.period) + ' rồi. PrintiFy cảm ơn bạn!';
      case 'NO_ACTIVE_QUESTIONS':
        return 'Khảo sát chưa mở câu hỏi. Bạn vui lòng quay lại sau.';
      default:
        return 'Tạm thời không thể gửi khảo sát.';
    }
  }

  submitSurvey(): void {
    if (!this.showForm || this.submitting || this.submitted) return;
    this.showValidation = true;
    this.submitError = '';
    this.ratings.markAllAsTouched();
    this.comment.markAsTouched();

    // Guard against unanswered questions and invalid optional comment.
    if (this.ratings.invalid || this.comment.invalid ||
        this.answeredCount !== this.questions.length) {
      this.submitError = 'Còn câu chưa trả lời, mình đưa bạn tới câu đó nhé.';
      if (this.answeredCount !== this.questions.length) this.goTo(this.firstUnanswered(0));
      return;
    }

    const answers = this.questions.map(question => ({
      questionId: question._id,
      score: this.ratings.get(question._id)!.value as number
    }));
    this.submitting = true;
    this.api.submitSurvey({ answers, comment: this.comment.value.trim() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.submitting = false;
          this.submitted = true;
          this.ratings.disable();
          if (this.status) {
            const answers = Object.values(this.ratings.getRawValue()).filter((v): v is number => v !== null);
            const avg = answers.length ? Math.round((answers.reduce((a, b) => a + b, 0) / answers.length) * 100) / 100 : null;
            this.status = {
              ...this.status,
              respondedThisPeriod: true,
              hasResponded: true,
              lastSubmittedAt: res.submittedAt,
              history: [{ _id: 'new', period: res.period, submittedAt: res.submittedAt, avg }, ...this.status.history],
            };
          }
          this.cdr.markForCheck();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        error: (error: HttpErrorResponse) => {
          this.submitting = false;
          this.submitError = error.status === 429
            ? 'Bạn vừa gửi một phiếu, đợi khoảng 30 giây rồi gửi lại nhé.'
            : error.status === 403
              ? 'Bạn không còn đủ điều kiện tham gia khảo sát.'
              : error.status === 401
                ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
                : error.status === 422
                  ? 'Dữ liệu câu trả lời chưa hợp lệ. Hãy tải lại trang rồi thử lại.'
                  : 'Chưa thể gửi khảo sát. Vui lòng thử lại.';
          this.cdr.markForCheck();
        }
      });
  }
}
