import { Component } from '@angular/core';

/** Khung trang phía khách: navbar + nội dung (kéo rèm) + footer chuyển động */
@Component({
  selector: 'app-shop-layout',
  standalone: false,
  template: `
    <app-navbar></app-navbar>
    <div class="curtain-content shop-main">
      <router-outlet></router-outlet>
    </div>
    <app-motion-footer></app-motion-footer>
  `,
  styles: [':host{display:block;background:#17111f}.shop-main{min-height:70vh;padding-bottom:56px}'],
})
export class ShopLayout {}
