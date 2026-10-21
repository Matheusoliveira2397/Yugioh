-- Contato para pagamento manual na página de créditos (PIX + WhatsApp).
CREATE TABLE IF NOT EXISTS "credit_payment_contact" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "pixKey" character varying(255),
  "whatsapp" character varying(64),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "PK_credit_payment_contact" PRIMARY KEY ("id")
);
