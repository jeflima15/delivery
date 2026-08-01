import type { Model, ProjectionType, SortOrder, UpdateQuery } from 'mongoose';
import mongoose from 'mongoose';

export class TenantRepository<T extends { tenantId?: mongoose.Types.ObjectId }> {
  constructor(private readonly model: Model<T>) {}

  list(tenantId: mongoose.Types.ObjectId, filter: Record<string, unknown> = {}, projection?: ProjectionType<T>, sort: Record<string, SortOrder> = { createdAt: -1 }) {
    return this.model.find({ ...filter, tenantId }, projection).sort(sort).lean();
  }

  findById(tenantId: mongoose.Types.ObjectId, id: string, projection?: ProjectionType<T>) {
    if (!mongoose.isValidObjectId(id)) return null;
    return this.model.findOne({ _id: id, tenantId }, projection).lean();
  }

  updateById(tenantId: mongoose.Types.ObjectId, id: string, update: UpdateQuery<T>) {
    if (!mongoose.isValidObjectId(id)) return null;
    return this.model.findOneAndUpdate({ _id: id, tenantId }, update, { returnDocument: 'after', runValidators: true }).lean();
  }

  deleteById(tenantId: mongoose.Types.ObjectId, id: string) {
    if (!mongoose.isValidObjectId(id)) return null;
    return this.model.findOneAndDelete({ _id: id, tenantId }).lean();
  }
}
