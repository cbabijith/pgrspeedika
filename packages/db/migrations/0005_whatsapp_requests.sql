ALTER TYPE "order_status" ADD VALUE IF NOT EXISTS 'awaiting_confirmation' BEFORE 'pending_payment';
