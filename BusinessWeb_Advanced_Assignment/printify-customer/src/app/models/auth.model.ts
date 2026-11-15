export interface CustomerUser {
  _id: string;
  name: string;
  email: string;
  role: 'CUSTOMER';
  status: 'ACTIVE';
  avatar: string | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

export interface OtpRequestResult {
  message: string;
  /** Mã 6 số hiện trên màn hình (bản demo không gửi email) */
  otp?: string;
}

export interface AuthResult {
  user: CustomerUser;
}