import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('commercial_catalog_items')
export class CommercialCatalogItem {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'varchar', length: 80, unique: true })
  sku: string;

  @Column({ type: 'varchar', length: 255 })
  description: string;

  @Column({ type: 'varchar', length: 80, default: '' })
  type: string;

  @Column({ name: 'daily_rate', type: 'numeric', precision: 12, scale: 2, default: 0 })
  dailyRate: number;

  @Column({ name: 'item_price', type: 'numeric', precision: 12, scale: 2, default: 0 })
  itemPrice: number;

  @Column({ type: 'varchar', length: 40, default: 'Each' })
  unit: string;

  @Column({ type: 'varchar', length: 32, default: 'active' })
  status: string;

  @Column({ type: 'text', default: '' })
  notes: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
