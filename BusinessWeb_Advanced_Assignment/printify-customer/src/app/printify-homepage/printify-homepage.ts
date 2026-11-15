import { Component, DestroyRef, ElementRef, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { Product, ProductService } from '../services/product-service';
import { Category } from '../models/product.model';
import { MarketService } from '../services/market-service';
import { ConfigService } from '../services/config-service';
import { TIERS } from '../models/membership.model';

interface Faq {
  q: string;
  a: string;
}

/**
 * C01 Trang chủ + C04 Về chúng tôi (#about) – trang đầu tiên khách thấy.
 * Thứ tự: giới thiệu -> video xưởng in -> về chúng tôi -> ý tưởng -> danh mục -> quy trình -> người sáng tạo -> hạng thành viên -> hỏi đáp.
 * Không có danh sách sản phẩm ở đây (đã có trang Sản phẩm /products).
 * Không dùng icon: ảnh phôi đặt trên khối màu (mix-blend multiply), số thứ tự và chữ lớn thay icon.
 * Số liệu, ảnh sản phẩm, danh mục, thiết kế Marketplace đều lấy từ dữ liệu thật.
 */
@Component({
  selector: 'app-printify-homepage',
  standalone: false,
  styleUrl: './printify-homepage.css',
  templateUrl: './printify-homepage.html',
})
export class PrintifyHomepage {
  readonly ps = inject(ProductService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly market = inject(MarketService);
  readonly cfg = inject(ConfigService).config;

  /** undefined = đang tải */
  private readonly all = toSignal<Product[]>(this.ps.getActiveProducts());
  readonly categories = toSignal(this.ps.getCategories(), { initialValue: [] as Category[] });
  readonly loading = computed(() => this.all() === undefined);
  readonly products = computed(() => this.all() ?? []);

  // ---------- Hero ----------
  /** Chữ đổi luân phiên trong tiêu đề */
  readonly words = ['áo thun', 'cốc sứ', 'túi tote', 'sổ tay', 'tranh canvas'];
  readonly wordIndex = signal(0);
  /** Chữ vừa rời đi (trượt lên trên) */
  readonly prevWord = signal(-1);
  /** 3 sản phẩm nổi bật ở hero (mỗi danh mục 1 cái) */
  readonly heroProducts = computed(() => {
    const seen = new Set<string>();
    return this.products().filter((p) => !seen.has(p.category) && !!seen.add(p.category)).slice(0, 3);
  });
  readonly designCount = computed(() => this.market.approved().length);
  readonly featuredDesigns = computed(() => this.market.approved().slice(0, 4));

  // ---------- Dải ảnh chạy ----------
  readonly strip = computed(() => this.products().slice(0, 14));

  // ---------- Danh mục ----------
  readonly categoryImage = computed(() => {
    const map = new Map<string, string>();
    // ưu tiên ảnh biến thể có màu (đen, be...) để nổi trên khối màu; phôi trắng sẽ bị chìm
    for (const p of this.products()) {
      if (map.has(p.category)) continue;
      const colored = p.variants.find((v) => v.imageUrl && !/white|trang|clear/i.test(v.color));
      map.set(p.category, colored?.imageUrl ?? p.img_display);
    }
    return map;
  });
  /** Màu khối nền theo danh mục (ảnh phôi nền trắng hòa vào khối nhờ multiply) */
  readonly tileTone = ['#f6c6dc', '#d9c8f5', '#ffd9c2', '#c9e4f2', '#efe3b8', '#d4ecd5'];

  /** Ảnh sản phẩm đã in thật (public/images/home) – hero và mục Ý tưởng */
  readonly heroPhotos = [
    { src: '/images/home/op-lung.webp', label: 'Ốp lưng điện thoại' },
    { src: '/images/home/tui-tote.webp', label: 'Túi tote canvas' },
    { src: '/images/home/binh-giu-nhiet.webp', label: 'Bình giữ nhiệt' },
    { src: '/images/home/moc-khoa-mica.webp', label: 'Móc khóa mica' },
  ];
  readonly ideas = [
    { src: '/images/home/the-deo.webp', label: 'Thẻ đeo', text: 'Hình vẽ tay của bạn trên thẻ đeo, dây đeo.' },
    { src: '/images/home/goi-tua.webp', label: 'Gối tựa', text: 'Chân dung thú cưng kèm tên, quà tặng không đụng hàng.' },
    { src: '/images/home/moc-khoa-kim-loai.webp', label: 'Móc khóa', text: 'Bộ sưu tập móc khóa theo chủ đề riêng.' },
    { src: '/images/home/danh-thiep.webp', label: 'Danh thiếp', text: 'Danh thiếp, thiệp mời mang nhận diện riêng.' },
  ];

  // ---------- Video xưởng in: khung nở rộng dần khi cuộn tới ----------
  private readonly film = viewChild<ElementRef<HTMLElement>>('film');
  /** 0 = khung nhỏ bo góc, 1 = tràn rộng */
  readonly filmProgress = signal(0);
  private readonly filmVideo = viewChild<ElementRef<HTMLVideoElement>>('filmVideo');

  readonly marquee = computed(() => this.categories().map((c) => c.label));

  // ---------- Quy trình ----------
  readonly steps = [
    { title: 'Chọn phôi', text: 'Áo, túi, cốc, sổ tay, tranh… đủ màu và size, xem tồn kho ngay trên trang.' },
    { title: 'Tự thiết kế', text: 'Thêm chữ, ảnh, hình khối, bút vẽ cho cả mặt trước và mặt sau, hoặc dùng mẫu từ Marketplace.' },
    { title: 'Đặt hàng & quét QR', text: 'Kiểm tra giỏ, chọn địa chỉ, thanh toán bằng QR ngân hàng hoặc MoMo trong 10 phút.' },
    { title: 'Duyệt mẫu & nhận hàng', text: 'PrintiFy kiểm tra file, gửi mẫu cho bạn duyệt rồi mới in hàng loạt và giao tận nơi.' },
  ];

  // ---------- Về chúng tôi ----------
  readonly values = [
    { title: 'In đúng như bạn thấy', text: 'Vùng in hiển thị rõ trên Editor. Mẫu được nhân viên kiểm tra trước khi in.' },
    { title: 'Bảo vệ người sáng tạo', text: 'Thiết kế trên Marketplace chỉ hiện ảnh có watermark, file gốc luôn được giữ kín.' },
    { title: 'Giá minh bạch', text: 'Thấy đủ tiền phôi, phí thiết kế, ưu đãi thành viên và phí giao trước khi thanh toán.' },
    { title: 'Duyệt trước khi in', text: 'Đơn có thiết kế riêng được gửi ảnh mẫu để bạn duyệt, chưa ưng thì chỉnh lại.' },
  ];
  readonly tiers = TIERS;
  readonly feePercent = computed(() => Math.round(this.cfg().platformFeeRate * 100));
  readonly openFaq = signal<number | null>(0);
  readonly faqs = computed<Faq[]>(() => {
    const c = this.cfg();
    const vnd = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + 'đ';
    return [
      {
        q: 'Thanh toán như thế nào?',
        a: `Sau khi đặt hàng, bạn chọn chuyển khoản ngân hàng hoặc ví MoMo rồi quét mã QR. Mã có hiệu lực ${c.orderPaymentMinutes} phút. Đơn chỉ được in sau khi nhân viên xác nhận đã nhận tiền.`,
      },
      {
        q: 'Phí giao hàng và ưu đãi ra sao?',
        a: `Phí giao hàng ${vnd(c.shippingFeeVnd)} mỗi đơn. Thành viên được giảm trên tiền hàng theo hạng: ${TIERS.map((t) => `${t.label} ${Math.round(t.discountRate * 100)}%`).join(', ')}.`,
      },
      {
        q: 'Mẫu in của tôi bị lỗi thì sao?',
        a: 'PrintiFy kiểm tra file trước khi in mẫu. Nếu chữ ra ngoài vùng in hay ảnh mờ, bạn sẽ nhận thông báo kèm lý do để sửa lại miễn phí, hoặc chọn vẫn in và tự chịu rủi ro.',
      },
      {
        q: 'Tôi có thể bán thiết kế của mình không?',
        a: `Có. Vào My marketplace, chọn thiết kế bạn tự tạo, đặt giá rồi gửi duyệt. Người mua trả thêm ${Math.round(c.platformFeeRate * 100)}% phí sàn, bạn nhận đúng giá đã đặt.`,
      },
      {
        q: 'Có cần tài khoản để mua không?',
        a: 'Bạn xem sản phẩm và thêm vào giỏ mà không cần đăng nhập. Khi thanh toán hoặc tự thiết kế thì cần đăng nhập để lưu đơn và thiết kế.',
      },
    ];
  });

  constructor() {
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    afterNextRender(() => {
      // Angular gắn thuộc tính muted sau khi tạo thẻ nên Chrome chưa coi là tắt tiếng -> tự phát lại
      const v = this.filmVideo()?.nativeElement;
      if (v) {
        v.muted = true;
        if (reduce) v.removeAttribute('autoplay');
        else void v.play().catch(() => undefined);
      }
      if (reduce) return this.filmProgress.set(1);
      let raf = 0;
      const update = () => {
        raf = 0;
        const el = this.film()?.nativeElement;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const vh = innerHeight;
        // bắt đầu nở khi mép trên khung vào 90% màn hình, nở hết khi lên tới 25%
        this.filmProgress.set(Math.min(1, Math.max(0, (vh * 0.9 - r.top) / (vh * 0.65))));
      };
      const onScroll = () => (raf ||= requestAnimationFrame(update));
      addEventListener('scroll', onScroll, { passive: true });
      addEventListener('resize', onScroll);
      update();
      this.destroyRef.onDestroy(() => {
        removeEventListener('scroll', onScroll);
        removeEventListener('resize', onScroll);
        cancelAnimationFrame(raf);
      });
    });
    const t = setInterval(() => {
      this.prevWord.set(this.wordIndex());
      this.wordIndex.update((i) => (i + 1) % this.words.length);
    }, 2400);
    this.destroyRef.onDestroy(() => clearInterval(t));

    // /#about, /#products: nội dung tải bất đồng bộ nên cuộn lại sau khi trang đã vẽ xong
    inject(ActivatedRoute)
      .fragment.pipe(takeUntilDestroyed())
      .subscribe((f) => {
        if (!f) return;
        const go = () => {
          const el = document.getElementById(f);
          if (el) scrollTo({ top: el.getBoundingClientRect().top + scrollY - 72, behavior: 'instant' as ScrollBehavior });
        };
        // lần 1 ngay sau khi vẽ, lần 2 sau khi sản phẩm tải xong (các mục phía trên cao thêm)
        setTimeout(go, 350);
        const wait = setInterval(() => {
          if (!this.loading()) {
            clearInterval(wait);
            setTimeout(go, 200);
          }
        }, 150);
        setTimeout(() => clearInterval(wait), 8000);
      });
  }

  toggleFaq(i: number): void {
    this.openFaq.set(this.openFaq() === i ? null : i);
  }

}
