import { Component, computed, inject, signal } from '@angular/core';
import { AdminAuthService } from '../../services/admin-auth.service';
import { AdminDataService } from '../../services/admin-data.service';
import { AdminNotificationService } from '../../services/admin-notification.service';
import { COLOR_LABELS, DIMENSIONS, ORDER_STATUS, confirmSubOf, isPaymentExpired, orderBadge } from '../../models/labels';
import { Order, OrderStatus } from '../../models/admin.models';

const DAY = 86400000;
type RangeKey = '7d' | '30d' | '90d' | '12m';
interface Bucket { start: number; end: number; label: string }

/** Khoảng thời gian: số ngày + cách chia cột của biểu đồ */
const RANGES: { key: RangeKey; label: string; days: number; step: 'day' | 'week' | 'month' }[] = [
  { key: '7d', label: '7 ngày', days: 7, step: 'day' },
  { key: '30d', label: '30 ngày', days: 30, step: 'day' },
  { key: '90d', label: '90 ngày', days: 90, step: 'week' },
  { key: '12m', label: '12 tháng', days: 365, step: 'month' },
];

const W = 720, H = 240, PAD_L = 8, PAD_R = 8, PAD_T = 14, PAD_B = 26;

/**
 * D0 – Tổng quan (Trang chủ + Dashboard gộp làm một).
 * Việc cần làm, KPI có sparkline + so với kỳ trước, biểu đồ doanh thu, trạng thái đơn,
 * đơn gần đây (lọc/sắp xếp/phân trang), bán chạy, tồn kho, Marketplace, khảo sát TAM.
 * Toàn bộ số liệu tính từ dữ liệu thật của GET /api/admin/data.
 */
@Component({
  selector: 'app-admin-homepage',
  standalone: false,
  templateUrl: './admin-homepage.html',
  styleUrl: './admin-homepage.css',
})
export class AdminHomepage {
  readonly auth = inject(AdminAuthService);
  readonly data = inject(AdminDataService);
  readonly notes = inject(AdminNotificationService);
  readonly ranges = RANGES;
  readonly dims = DIMENSIONS;
  readonly chartW = W;
  readonly chartH = H;

  readonly hello = (() => {
    const h = new Date().getHours();
    return h < 11 ? 'Chào buổi sáng' : h < 14 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  })();

  // ---------------- Việc cần làm ----------------
  private count(sub: string): number {
    return this.data.orders().filter((o) => confirmSubOf(o) === sub).length;
  }
  readonly todo = computed(() => [
    { icon: 'card', label: 'Xác nhận thanh toán', value: this.count('payment_review'), link: '/admin/orders-list', q: { tab: 'confirm', sub: 'payment_review' } },
    { icon: 'image', label: 'Kiểm tra mẫu in', value: this.count('design_review'), link: '/admin/orders-list', q: { tab: 'confirm', sub: 'design_review' } },
    { icon: 'x-circle', label: 'Yêu cầu hủy', value: this.count('cancel_request'), link: '/admin/orders-list', q: { tab: 'confirm', sub: 'cancel_request' } },
    { icon: 'truck', label: 'Sẵn sàng giao', value: this.data.orders().filter((o) => o.orderStatus === 'PRINT_COMPLETED').length, link: '/admin/orders-list', q: { tab: 'printed' } },
    { icon: 'tag', label: 'Tin chờ duyệt', value: this.data.listings().filter((l) => l.status === 'PENDING_REVIEW').length, link: '/admin/marketplace', q: { tab: 'PENDING_REVIEW' } },
    { icon: 'flag', label: 'Báo cáo vi phạm', value: this.data.reports().filter((r) => r.status === 'OPEN').length, link: '/admin/marketplace', q: { tab: 'reports' } },
    { icon: 'trending-down', label: 'Sắp hết hàng', value: this.data.products().filter((p) => p.isActive && this.data.stockLevel(p) !== 'ok').length, link: '/admin/products-list', q: { stock: 'low' } },
  ]);
  readonly todoTotal = computed(() => this.todo().reduce((s, t) => s + t.value, 0));

  // ---------------- Khoảng thời gian ----------------
  readonly range = signal<RangeKey>('30d');
  readonly rangeIndex = computed(() => RANGES.findIndex((r) => r.key === this.range()));
  private readonly rangeDef = computed(() => RANGES[this.rangeIndex()]);

  /** [đầu kỳ, cuối kỳ) hiện tại và kỳ liền trước cùng độ dài */
  private readonly window = computed(() => {
    const end = startOfDay(Date.now()) + DAY;
    const start = end - this.rangeDef().days * DAY;
    return { start, end, prevStart: start - (end - start) };
  });

  private readonly buckets = computed<Bucket[]>(() => {
    const { start, end } = this.window();
    const step = this.rangeDef().step;
    const out: Bucket[] = [];
    if (step === 'month') {
      const d = new Date(end - DAY);
      for (let i = 11; i >= 0; i--) {
        const s = new Date(d.getFullYear(), d.getMonth() - i, 1).getTime();
        const e = new Date(d.getFullYear(), d.getMonth() - i + 1, 1).getTime();
        out.push({ start: s, end: e, label: `T${new Date(s).getMonth() + 1}` });
      }
      return out;
    }
    const size = step === 'week' ? 7 * DAY : DAY;
    for (let s = start; s < end; s += size) {
      out.push({ start: s, end: Math.min(end, s + size), label: new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) });
    }
    return out;
  });

  private paid(o: Order): boolean {
    return o.paymentStatus === 'PAID' && o.orderStatus !== 'CANCELLED';
  }
  private paidTime(o: Order): number {
    return Date.parse(o.paidAt ?? o.createdAt);
  }

  readonly orders = computed(() => {
    const { start, end } = this.window();
    return this.data.orders().filter((o) => { const t = Date.parse(o.createdAt); return t >= start && t < end; });
  });
  readonly paidOrders = computed(() => {
    const { start, end } = this.window();
    return this.data.orders().filter((o) => { const t = this.paidTime(o); return this.paid(o) && t >= start && t < end; });
  });
  private readonly prevPaid = computed(() => {
    const { start, prevStart } = this.window();
    return this.data.orders().filter((o) => { const t = this.paidTime(o); return this.paid(o) && t >= prevStart && t < start; });
  });
  private readonly prevOrders = computed(() => {
    const { start, prevStart } = this.window();
    return this.data.orders().filter((o) => { const t = Date.parse(o.createdAt); return t >= prevStart && t < start; });
  });

  readonly revenue = computed(() => {
    const r = { product: 0, design: 0, discount: 0, shipping: 0, total: 0 };
    for (const o of this.paidOrders()) {
      r.product += o.totals.productSubtotal; r.design += o.totals.designFees; r.discount += o.totals.discount; r.shipping += o.totals.shipping; r.total += o.totals.total;
    }
    return r;
  });

  /** Doanh thu theo từng cột của kỳ hiện tại và kỳ trước (dịch lùi đúng 1 kỳ) */
  readonly series = computed(() => {
    const bs = this.buckets();
    const { start, prevStart } = this.window();
    const shift = start - prevStart;
    const cur = bs.map(() => 0), prev = bs.map(() => 0), cnt = bs.map(() => 0);
    for (const o of this.data.orders()) {
      if (!this.paid(o)) continue;
      const t = this.paidTime(o);
      const i = bs.findIndex((b) => t >= b.start && t < b.end);
      if (i >= 0) { cur[i] += o.totals.total; cnt[i]++; }
      const j = bs.findIndex((b) => t >= b.start - shift && t < b.end - shift);
      if (j >= 0) prev[j] += o.totals.total;
    }
    return { labels: bs.map((b) => b.label), cur, prev, cnt };
  });

  readonly kpis = computed(() => {
    const s = this.series();
    const paid = this.paidOrders(), prevPaid = this.prevPaid();
    const rev = this.revenue().total, prevRev = sum(prevPaid.map((o) => o.totals.total));
    const aov = paid.length ? rev / paid.length : 0, prevAov = prevPaid.length ? prevRev / prevPaid.length : 0;
    const { start, end, prevStart } = this.window();
    const sales = this.data.designSales().filter((x) => x.status !== 'REVERSED');
    const salesCur = sales.filter((x) => { const t = Date.parse(x.recordedAt); return t >= start && t < end; }).length;
    const salesPrev = sales.filter((x) => { const t = Date.parse(x.recordedAt); return t >= prevStart && t < start; }).length;
    return [
      { label: 'Doanh thu', value: rev, money: true, delta: delta(rev, prevRev), spark: s.cur, icon: 'wallet' },
      { label: 'Đơn hàng mới', value: this.orders().length, money: false, delta: delta(this.orders().length, this.prevOrders().length), spark: s.cnt, icon: 'receipt' },
      { label: 'Giá trị TB / đơn', value: aov, money: true, delta: delta(aov, prevAov), spark: s.cur.map((v, i) => (s.cnt[i] ? v / s.cnt[i] : 0)), icon: 'bag' },
      { label: 'Lượt bán thiết kế', value: salesCur, money: false, delta: delta(salesCur, salesPrev), spark: null, icon: 'palette' },
    ];
  });

  sparkPath(v: number[] | null): string {
    if (!v || v.length < 2) return '';
    const max = Math.max(1, ...v);
    return v.map((y, i) => `${i ? 'L' : 'M'}${((i / (v.length - 1)) * 100).toFixed(1)},${(28 - (y / max) * 26).toFixed(1)}`).join('');
  }

  // ---------------- Biểu đồ doanh thu ----------------
  readonly chart = computed(() => {
    const { cur, prev, labels } = this.series();
    const n = cur.length;
    const max = niceMax(Math.max(1, ...cur, ...prev));
    const x = (i: number) => PAD_L + (n === 1 ? 0 : (i / (n - 1)) * (W - PAD_L - PAD_R));
    const y = (v: number) => PAD_T + (1 - v / max) * (H - PAD_T - PAD_B);
    const line = (vs: number[]) => vs.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    const curLine = line(cur);
    const area = `${curLine}L${x(n - 1).toFixed(1)},${H - PAD_B}L${x(0).toFixed(1)},${H - PAD_B}Z`;
    const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ y: y(max * f), label: compact(max * f) }));
    const every = Math.ceil(n / 8);
    const ticks = labels.map((l, i) => ({ x: x(i), l })).filter((_, i) => i % every === 0 || (i === n - 1 && (n - 1) % every >= every / 2));
    return { curLine, prevLine: line(prev), area, grid, ticks, x, y, n };
  });
  readonly hover = signal<number | null>(null);
  readonly hoverInfo = computed(() => {
    const i = this.hover();
    if (i === null) return null;
    const s = this.series(), c = this.chart();
    if (i >= c.n) return null;
    return { i, x: c.x(i), y: c.y(s.cur[i]), label: s.labels[i], cur: s.cur[i], prev: s.prev[i], cnt: s.cnt[i], left: (c.x(i) / W) * 100 };
  });

  onChartMove(e: PointerEvent, el: Element): void {
    const r = el.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const n = this.chart().n;
    const i = Math.round(((px - PAD_L) / (W - PAD_L - PAD_R)) * (n - 1));
    this.hover.set(Math.max(0, Math.min(n - 1, i)));
  }

  readonly revenueTotals = computed(() => {
    const s = this.series();
    return { cur: sum(s.cur), prev: sum(s.prev), delta: delta(sum(s.cur), sum(s.prev)) };
  });

  // ---------------- Trạng thái đơn ----------------
  readonly byStatus = computed(() => {
    const counts = new Map<string, number>();
    for (const o of this.orders()) {
      const key = isPaymentExpired(o) ? 'CANCELLED' : o.orderStatus;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const total = Math.max(1, this.orders().length);
    return (Object.keys(ORDER_STATUS) as OrderStatus[])
      .map((s) => ({ status: s, label: ORDER_STATUS[s].label, tone: ORDER_STATUS[s].tone, value: counts.get(s) ?? 0, pct: ((counts.get(s) ?? 0) / total) * 100 }))
      .filter((s) => s.value > 0);
  });

  // ---------------- Đơn gần đây ----------------
  readonly search = signal('');
  readonly statusFilter = signal<'' | OrderStatus>('');
  readonly sortKey = signal<'createdAt' | 'total'>('createdAt');
  readonly sortDir = signal<1 | -1>(-1);
  readonly pageNo = signal(0);
  readonly pageSize = 6;
  readonly statusOptions = Object.entries(ORDER_STATUS).map(([k, v]) => ({ key: k as OrderStatus, label: v.label }));

  private readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase(), st = this.statusFilter(), k = this.sortKey(), dir = this.sortDir();
    return this.data.orders()
      .filter((o) => (!st || o.orderStatus === st) && (!q || o._id.toLowerCase().includes(q) || o.shippingInfo.name.toLowerCase().includes(q)))
      .sort((a, b) => dir * (k === 'total' ? a.totals.total - b.totals.total : Date.parse(a.createdAt) - Date.parse(b.createdAt)));
  });
  readonly pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly recent = computed(() => {
    const p = Math.min(this.pageNo(), this.pages() - 1);
    return this.filtered().slice(p * this.pageSize, (p + 1) * this.pageSize);
  });
  readonly totalFiltered = computed(() => this.filtered().length);
  readonly statusOf = orderBadge;

  sortBy(k: 'createdAt' | 'total'): void {
    if (this.sortKey() === k) this.sortDir.update((d) => (d === 1 ? -1 : 1));
    else { this.sortKey.set(k); this.sortDir.set(-1); }
    this.pageNo.set(0);
  }

  // ---------------- Bán chạy, tồn kho, Marketplace ----------------
  readonly topProducts = computed(() => {
    const m = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const o of this.paidOrders()) for (const i of o.items) {
      const x = m.get(i.productId) ?? { name: i.productName, qty: 0, revenue: 0 };
      x.qty += i.qty; x.revenue += i.qty * i.unitPrice;
      m.set(i.productId, x);
    }
    const list = [...m.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.qty - a.qty).slice(0, 5);
    const max = Math.max(1, ...list.map((x) => x.qty));
    return list.map((x) => ({ ...x, pct: (x.qty / max) * 100 }));
  });

  readonly stock = computed(() => {
    const low: { id: string; name: string; variant: string; stock: number }[] = [];
    let out = 0, lowCount = 0;
    for (const p of this.data.products()) {
      if (!p.isActive) continue;
      for (const v of p.variants) {
        if (v.stock <= 0) out++;
        else if (v.stock <= p.lowStockThreshold) lowCount++;
        if (v.stock <= p.lowStockThreshold) low.push({ id: p._id, name: p.name, variant: [COLOR_LABELS[v.color] ?? v.color, v.size].filter(Boolean).join(' / '), stock: v.stock });
      }
    }
    return { out, low: lowCount, list: low.sort((a, b) => a.stock - b.stock).slice(0, 5) };
  });

  readonly market = computed(() => {
    const { start, end } = this.window();
    const sales = this.data.designSales().filter((s) => { const t = Date.parse(s.recordedAt); return s.status !== 'REVERSED' && t >= start && t < end; });
    return {
      count: sales.length,
      seller: sum(sales.map((x) => x.sellerPrice)),
      fee: sum(sales.map((x) => x.platformFee)),
      pending: this.data.listings().filter((l) => l.status === 'PENDING_REVIEW').length,
      approved: this.data.listings().filter((l) => l.status === 'APPROVED').length,
      reports: this.data.reports().filter((r) => r.status === 'OPEN').length,
    };
  });

  // ---------------- Khảo sát TAM ----------------
  readonly includeDemo = signal(true);
  readonly showQuestions = signal(false);
  readonly responses = computed(() => this.data.surveyResponses().filter((r) => this.includeDemo() || !r.demo));
  readonly demoCount = computed(() => this.data.surveyResponses().filter((r) => r.demo).length);
  readonly tam = computed(() => {
    const rs = this.responses();
    return this.dims.map((d) => {
      const scores = rs.flatMap((r) => r.answers.filter((a) => a.dimension === d.key).map((a) => a.score));
      const avg = scores.length ? sum(scores) / scores.length : 0;
      return { ...d, avg, n: scores.length, pct: (avg / 5) * 100 };
    });
  });
  readonly distribution = computed(() => {
    const c = [0, 0, 0, 0, 0];
    for (const r of this.responses()) for (const a of r.answers) if (a.score >= 1 && a.score <= 5) c[a.score - 1]++;
    const total = sum(c) || 1;
    const max = Math.max(1, ...c);
    return c.map((v, i) => ({ score: i + 1, value: v, pct: (v / total) * 100, h: (v / max) * 100 }));
  });
  readonly questions = computed(() => {
    const rs = this.responses();
    return this.data.surveyQuestions().map((q) => {
      const s = rs.flatMap((r) => r.answers.filter((a) => a.questionId === q._id).map((a) => a.score));
      return { ...q, avg: s.length ? sum(s) / s.length : 0, n: s.length };
    });
  });

  /** Xuất CSV phiếu khảo sát để phân tích TAM (không có tên người trả lời) */
  exportCsv(): void {
    const qs = this.data.surveyQuestions();
    const rows = [['responseId', 'submittedAt', 'demo', ...qs.map((q) => q._id)]];
    for (const r of this.responses()) {
      const m = new Map(r.answers.map((a) => [a.questionId, a.score]));
      rows.push([r._id, r.submittedAt, r.demo ? '1' : '0', ...qs.map((q) => String(m.get(q._id) ?? ''))]);
    }
    const blob = new Blob(['﻿' + rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'printify-tam-survey.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  readonly compact = compact;
}

function sum(v: number[]): number {
  return v.reduce((s, x) => s + x, 0);
}
function startOfDay(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
/** % thay đổi so với kỳ trước; null khi kỳ trước = 0 */
function delta(cur: number, prev: number): number | null {
  if (!prev) return cur ? null : 0;
  return ((cur - prev) / prev) * 100;
}
function niceMax(v: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
/** 1250000 -> "1,25tr" */
function compact(v: number): string {
  if (v >= 1e9) return (v / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + 'tỷ';
  if (v >= 1e6) return (v / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + 'tr';
  if (v >= 1e3) return (v / 1e3).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + 'k';
  return Math.round(v).toLocaleString('vi-VN');
}
