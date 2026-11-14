import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ProductCard } from './product-card/product-card';
import { Pagination } from './pagination/pagination';
import { EmptyState } from './empty-state/empty-state';
import { VndPipe } from './pipes/vnd-pipe';
import { StatusBadge } from './status-badge/status-badge';
import { OrderSummary } from './order-summary/order-summary';
import { ImgFallbackDirective } from './img-fallback.directive';
import { NotificationBell } from './notification-bell/notification-bell';
import { MotionFooter } from './motion-footer/motion-footer';
import { IconComponent } from './motion/icon';
import { MOTION } from './motion/motion-directives';
import { QrPaymentDialog } from '../cart/qr-payment-dialog/qr-payment-dialog';

/** Component/pipe dùng lại ở nhiều module (Ch.II 2.3: @Input/@Output) */
@NgModule({
  declarations: [ProductCard, Pagination, EmptyState, VndPipe, StatusBadge, OrderSummary, NotificationBell, QrPaymentDialog, MotionFooter],
  imports: [CommonModule, RouterModule, ImgFallbackDirective, IconComponent, ...MOTION],
  exports: [
    CommonModule,
    RouterModule,
    ImgFallbackDirective,
    ProductCard,
    Pagination,
    EmptyState,
    VndPipe,
    StatusBadge,
    OrderSummary,
    NotificationBell,
    QrPaymentDialog,
    MotionFooter,
    IconComponent,
    ...MOTION,
  ],
})
export class SharedModule {}
