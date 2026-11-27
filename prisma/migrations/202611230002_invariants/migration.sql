ALTER TABLE "Service" ADD CONSTRAINT "Service_price_positive" CHECK (price > 0);
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_capacity_bounded" CHECK (capacity > 0 AND reserved >= 0 AND reserved <= capacity);
ALTER TABLE "Order" ADD CONSTRAINT "Order_money_consistent" CHECK (subtotal >= 0 AND "convenienceFee" >= 0 AND "deliveryFee" >= 0 AND commission >= 0 AND "companyShare" >= 0 AND total = subtotal + "convenienceFee" + "deliveryFee" - discount + tax AND "companyShare" + commission = subtotal);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_amount_consistent" CHECK (quantity > 0 AND "unitPrice" > 0 AND "lineTotal" = "unitPrice" * quantity);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_money_positive" CHECK (amount > 0 AND "providerFees" >= 0 AND currency = 'GHS');
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_components_consistent" CHECK (amount > 0 AND "laundryAmount" >= 0 AND "commissionReversal" >= 0 AND "companyReversal" >= 0 AND "convenienceReversal" >= 0 AND "deliveryReversal" >= 0 AND amount = "laundryAmount" + "convenienceReversal" + "deliveryReversal" AND "laundryAmount" = "companyReversal" + "commissionReversal");
ALTER TABLE "LedgerLine" ADD CONSTRAINT "LedgerLine_one_side" CHECK (debit >= 0 AND credit >= 0 AND (debit = 0 OR credit = 0) AND debit + credit > 0);
ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_range" CHECK (rating BETWEEN 1 AND 5);
CREATE FUNCTION freshfold_immutable_ledger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Posted financial records are immutable; use a corrective balancing journal.'; END; $$;
CREATE TRIGGER immutable_ledger_line BEFORE UPDATE OR DELETE ON "LedgerLine" FOR EACH ROW EXECUTE FUNCTION freshfold_immutable_ledger();
CREATE TRIGGER immutable_journal BEFORE UPDATE OR DELETE ON "Journal" FOR EACH ROW EXECUTE FUNCTION freshfold_immutable_ledger();
CREATE FUNCTION freshfold_balanced_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target text; balance bigint; count_lines bigint;
BEGIN
  target := NEW."journalId";
  SELECT COALESCE(SUM(debit-credit),0), COUNT(*) INTO balance, count_lines FROM "LedgerLine" WHERE "journalId"=target;
  IF balance <> 0 OR count_lines < 2 THEN RAISE EXCEPTION 'Journal must contain at least two balancing ledger lines.'; END IF;
  RETURN NEW;
END; $$;
CREATE CONSTRAINT TRIGGER balanced_journal AFTER INSERT ON "LedgerLine" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION freshfold_balanced_journal();
