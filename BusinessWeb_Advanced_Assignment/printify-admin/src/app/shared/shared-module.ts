import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { VndPipe } from './vnd.pipe';
import { StatusBadge } from './status-badge';
import { IconComponent } from './icon';

/** Dùng chung cho mọi màn Admin */
@NgModule({
  declarations: [VndPipe, StatusBadge],
  imports: [CommonModule, RouterModule, IconComponent],
  exports: [CommonModule, RouterModule, FormsModule, ReactiveFormsModule, VndPipe, StatusBadge, IconComponent],
})
export class SharedModule {}
