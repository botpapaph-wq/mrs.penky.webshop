// Shared Type Definitions
export interface PayMongoCheckoutSessionRequest {
  data: {
    attributes: {
      line_items: Array<{
        name: string;
        amount: number;
        currency: 'PHP' | 'USD';
        quantity: number;
      }>;
      payment_method_types: string[];
      success_url: string;
      cancel_url: string;
      reference_number: string;
      description?: string;
      customer_email?: string;
    };
  };
}

export interface ZohoInvoiceRequest {
  contact_name: string;
  email: string;
  phone: string;
  line_items: Array<{
    item_name: string;
    quantity: number;
    rate: number;
  }>;
  reference_number: string;
  currency_id: string;
}

export interface OrderData {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_address: string;
  total_amount_php: number;
  total_amount_usd?: number;
  currency_code: 'PHP' | 'USD';
  payment_status: string;
  items: Array<{
    product_id: string;
    quantity: number;
    unit_price_php: number;
  }>;
}
