export interface Product {
  id?: string;
  _id?: string;
  nome: string;
  descricao?: string;
  preco?: number;
  categoriaId?: string;
  imagem?: string;
  [key: string]: any;
}

export interface Category {
  id?: string;
  _id?: string;
  nome: string;
  [key: string]: any;
}

export interface StoreSettings {
  nome_loja: string;
  logo_url?: string;
  capa_url?: string;
  is_open?: boolean;
  tempo_entrega?: string;
  whatsapp?: string;
  theme?: any;
  [key: string]: any;
}

export interface CartItem {
  produtoId: string;
  nome: string;
  preco_unitario: number;
  quantidade: number;
  subtotal: number;
  [key: string]: any;
}

export interface HomeBlock {
  type: string;
  content: any;
  [key: string]: any;
}
