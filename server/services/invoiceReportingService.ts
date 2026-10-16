import type { PipelineStage } from 'mongoose';
import Invoice from '../models/Invoice.js';
import { MASTER_REPORT_TIMEZONE } from '../../src/lib/masterReporting.js';
import { openInvoiceStatuses } from './billingStateService.js';

export function financialInvoiceStatus(now: Date) {
  return { $cond: [
    { $in: ['$status', openInvoiceStatuses] },
    { $cond: [{ $lt: ['$dueAt', now] }, 'overdue', 'pending'] },
    '$status',
  ] };
}

export async function invoiceFinancialReport(from: Date, to: Date, now = new Date()) {
  const pipeline: PipelineStage[] = [
    { $match: { $or: [
      { status: 'paid', paidAt: { $gte: from, $lte: to } },
      { status: { $in: openInvoiceStatuses }, dueAt: { $gte: from, $lte: to } },
    ] } },
    { $set: {
      financialStatus: financialInvoiceStatus(now),
      financialDate: { $cond: [{ $eq: ['$status', 'paid'] }, '$paidAt', '$dueAt'] },
    } },
    { $facet: {
      totals: [{ $group: { _id: '$financialStatus', cents: { $sum: '$amountCents' }, count: { $sum: 1 } } }],
      series: [
        { $group: {
          _id: { $dateToString: { date: '$financialDate', format: '%Y-%m-%d', timezone: MASTER_REPORT_TIMEZONE } },
          paidCents: { $sum: { $cond: [{ $eq: ['$financialStatus', 'paid'] }, '$amountCents', 0] } },
          pendingCents: { $sum: { $cond: [{ $in: ['$financialStatus', ['pending', 'overdue']] }, '$amountCents', 0] } },
        } }, { $sort: { _id: 1 } },
      ],
      monthly: [
        { $group: {
          _id: { month: { $dateToString: { date: '$financialDate', format: '%Y-%m', timezone: MASTER_REPORT_TIMEZONE } }, status: '$financialStatus' },
          cents: { $sum: '$amountCents' }, count: { $sum: 1 },
        } }, { $sort: { '_id.month': 1, '_id.status': 1 } },
      ],
    } },
  ];
  const [result] = await Invoice.aggregate(pipeline);
  return result as {
    totals: Array<{ _id: string; cents: number; count: number }>;
    series: Array<{ _id: string; paidCents: number; pendingCents: number }>;
    monthly: Array<{ _id: { month: string; status: string }; cents: number; count: number }>;
  };
}
