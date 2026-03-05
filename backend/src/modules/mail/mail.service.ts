import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter | null = null;
  private readonly emailUser: string;
  private readonly frontendUrl: string;

  constructor(private configService: ConfigService) {
    this.emailUser = this.configService.get<string>('EMAIL_USER') ?? '';
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
    const emailPassword = (this.configService.get<string>('EMAIL_PASSWORD') ?? '').replace(/\s/g, '');

    console.log('🔍 [MailService] Verificando variáveis de ambiente...');
    console.log(`   EMAIL_USER: ${this.emailUser || 'NÃO DEFINIDO'}`);
    console.log(`   EMAIL_PASSWORD: ${emailPassword ? 'DEFINIDO (' + emailPassword.length + ' caracteres)' : 'NÃO DEFINIDO'}`);
    console.log(`   FRONTEND_URL: ${this.frontendUrl || 'NÃO DEFINIDO'}`);

    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    if (!this.emailUser || this.emailUser === 'seu-email@gmail.com') {
      console.log('⚠️ [MailService] Email não configurado - links aparecerão no console');
      if (isProduction) {
        console.error('❌ [MailService] PRODUÇÃO: Defina EMAIL_USER e EMAIL_PASSWORD nas variáveis de ambiente do servidor para enviar emails.');
      } else {
        console.log('💡 [MailService] Dica: Defina EMAIL_USER e EMAIL_PASSWORD no arquivo backend/.env');
      }
      return;
    }
    if (!emailPassword) {
      console.error('❌ [MailService] EMAIL_PASSWORD não está configurado!');
      if (isProduction) {
        console.error('❌ [MailService] PRODUÇÃO: Adicione EMAIL_PASSWORD (Senha de app do Gmail) nas variáveis de ambiente do servidor.');
      }
      return;
    }

    console.log(`📧 [MailService] Configurando SMTP com: ${this.emailUser}`);
    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: this.emailUser,
        pass: emailPassword,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    this.transporter.verify((error) => {
      if (error) {
        const smtpError = error as any;
        console.error('❌ [MailService] Erro ao verificar conexão SMTP:', smtpError?.message || error);
        if (smtpError?.code === 'EAUTH') {
          console.error('💡 [MailService] Use a Senha de App do Gmail: https://myaccount.google.com/apppasswords');
        }
      } else {
        console.log('✅ [MailService] SMTP OK – emails serão enviados para o endereço que a pessoa cadastrar.');
      }
    });
  }

  async sendVerificationEmail(email: string, nickname: string, token: string): Promise<boolean> {
    const verificationUrl = `${this.frontendUrl}/verify-email/${token}`;

    if (!this.transporter) {
      console.log(`\n⚠️ [MailService] Email não configurado - Link de verificação para ${nickname} (${email}):`);
      console.log(`   ${verificationUrl}\n`);
      return false;
    }

    const toAddress = email.trim().toLowerCase();
    console.log(`📧 [MailService] Enviando verificação para: ${toAddress} (${nickname})`);

    try {
      const info = await this.transporter.sendMail({
        from: `"YuGiOh RPG: Champions Of Duels" <${this.emailUser}>`,
        to: toAddress,
        subject: '🎴 Confirme seu cadastro no YuGiOh RPG: Champions Of Duels',
        html: `
          <!DOCTYPE html>
          <html lang="pt-BR">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f0f1a; color: #e2e8f0; margin: 0; padding: 24px; -webkit-font-smoothing: antialiased; }
              .wrapper { max-width: 520px; margin: 0 auto; }
              .card { background: #1a1a2e; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.4); }
              .brand { background: linear-gradient(135deg, #2d1b4e 0%, #1e3a5f 100%); padding: 28px 24px; text-align: center; border-bottom: 2px solid rgba(251, 191, 36, 0.3); }
              .brand h1 { color: #fbbf24; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: -0.5px; }
              .brand p { color: #94a3b8; margin: 8px 0 0 0; font-size: 13px; }
              .body { padding: 28px 24px; }
              .body p { margin: 0 0 16px 0; line-height: 1.6; font-size: 15px; color: #cbd5e1; }
              .body .hi { font-size: 17px; margin-bottom: 20px; }
              .body .hi strong { color: #fbbf24; }
              .cta-wrap { text-align: center; margin: 28px 0; }
              .cta { display: inline-block; padding: 16px 36px; background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%); color: #fff !important; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 16px; }
              .link-fallback { margin-top: 20px; padding: 14px; background: rgba(96, 165, 250, 0.12); border-radius: 8px; border-left: 4px solid #60a5fa; word-break: break-all; font-size: 12px; color: #93c5fd; }
              .warning { padding: 18px; background: rgba(239, 68, 68, 0.12); border-left: 4px solid #ef4444; border-radius: 0 8px 8px 0; margin-top: 24px; }
              .warning strong { color: #fca5a5; }
              .warning ul { margin: 8px 0 0 0; padding-left: 20px; color: #fecaca; font-size: 13px; line-height: 1.7; }
              .footer { text-align: center; padding: 24px 24px 28px; color: #64748b; font-size: 12px; }
              .footer p { margin: 4px 0; }
            </style>
          </head>
          <body>
            <div class="wrapper">
              <div class="card">
                <div class="brand">
                  <h1>🎴 YuGiOh RPG: Champions Of Duels</h1>
                  <p>Confirme seu cadastro</p>
                </div>
                <div class="body">
                  <p class="hi">Olá, <strong>${nickname}</strong>!</p>
                  <p>Bem-vindo ao YuGiOh RPG: Champions Of Duels! Para ativar sua conta e começar a duelar, confirme seu email clicando no botão abaixo.</p>
                  <div class="cta-wrap">
                    <a href="${verificationUrl}" class="cta">Confirmar email</a>
                  </div>
                  <p style="margin-bottom: 8px; font-size: 13px; color: #94a3b8;">Se o botão não funcionar, copie e cole este link no navegador:</p>
                  <div class="link-fallback">${verificationUrl}</div>
                  <div class="warning">
                    <strong>Importante</strong>
                    <ul>
                      <li>Este link expira em 24 horas.</li>
                      <li>Se você não criou esta conta, ignore este email.</li>
                      <li>Nunca compartilhe este link com outras pessoas.</li>
                    </ul>
                  </div>
                </div>
                <div class="footer">
                  <p>Este é um email automático. Não responda.</p>
                  <p>© 2025 YuGiOh RPG: Champions Of Duels</p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `,
      });

      console.log(`✅ [MailService] ========== EMAIL ENVIADO COM SUCESSO ==========`);
      console.log(`✅ [MailService] Email de verificação enviado para: ${email}`);
      console.log(`📧 [MailService] Message ID: ${info.messageId || 'N/A'}`);
      console.log(`📧 [MailService] Response: ${info.response || 'N/A'}`);
      console.log(`📧 [MailService] Accepted: ${JSON.stringify(info.accepted || [])}`);
      console.log(`📧 [MailService] Rejected: ${JSON.stringify(info.rejected || [])}`);
      console.log(`📧 [MailService] ===============================================`);
      
      // Verificar se o email foi realmente aceito
      if (info.accepted && info.accepted.length > 0) {
        console.log(`✅ [MailService] Email aceito pelo servidor SMTP`);
        return true;
      } else if (info.rejected && info.rejected.length > 0) {
        console.error(`❌ [MailService] Email REJEITADO pelo servidor SMTP: ${JSON.stringify(info.rejected)}`);
        return false;
      } else {
        console.warn(`⚠️ [MailService] Status do email não está claro, mas retornando sucesso`);
        return true;
      }
    } catch (error: any) {
      console.error('❌ [MailService] Erro ao enviar email de verificação:');
      console.error(`   Tipo: ${error?.constructor?.name}`);
      console.error(`   Mensagem: ${error?.message || 'Erro desconhecido'}`);
      console.error(`   Código: ${error?.code || 'N/A'}`);
      console.error(`   Command: ${error?.command || 'N/A'}`);
      
      // Log detalhado do erro
      if (error.response) {
        console.error(`   Response: ${error.response}`);
      }
      if (error.responseCode) {
        console.error(`   Response Code: ${error.responseCode}`);
      }
      
      // Se for erro de autenticação, dar dica
      if (error.code === 'EAUTH' || error.message?.includes('Invalid login')) {
        console.error('💡 [MailService] Dica: Verifique se está usando a Senha de App do Gmail, não a senha normal da conta');
      }
      
      // Retornar false em vez de lançar erro
      return false;
    }
  }

  async sendWelcomeEmail(email: string, nickname: string) {
    // Se não tem transporter configurado, apenas loga
    if (!this.transporter) {
      console.log(`\n🎉 Boas-vindas para ${nickname} (${email})!\n`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: `"YuGiOh RPG: Champions Of Duels" <${this.emailUser}>`,
        to: email.trim().toLowerCase(),
        subject: '🎉 Bem-vindo ao YuGiOh RPG: Champions Of Duels!',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body {
                font-family: Arial, sans-serif;
                background-color: #1a1a2e;
                color: #ffffff;
                margin: 0;
                padding: 0;
              }
              .container {
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
                background: linear-gradient(135deg, #16213e 0%, #0f3460 100%);
                border-radius: 10px;
              }
              .header {
                text-align: center;
                padding: 20px;
                background: rgba(139, 92, 246, 0.1);
                border-radius: 10px;
                margin-bottom: 30px;
              }
              h1 {
                color: #fbbf24;
                margin: 0;
                font-size: 28px;
              }
              .gift-box {
                background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
                padding: 20px;
                border-radius: 8px;
                text-align: center;
                margin: 20px 0;
              }
              .gift-box h2 {
                margin: 0 0 10px 0;
                color: #fbbf24;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🎴 YuGiOh RPG: Champions Of Duels</h1>
              </div>
              
              <h2 style="text-align: center; color: #fbbf24;">Bem-vindo, ${nickname}! 🎉</h2>
              
              <p style="text-align: center;">Sua conta foi ativada com sucesso!</p>
              
              <div class="gift-box">
                <h2>🎁 Bônus de Boas-Vindas</h2>
                <p style="font-size: 24px; margin: 10px 0;">💎 500 Gemas</p>
                <p>Use suas gemas para comprar pacotes e construir seu deck!</p>
              </div>
              
              <div style="background: rgba(255, 255, 255, 0.05); padding: 20px; border-radius: 8px;">
                <h3 style="color: #60a5fa;">📚 Próximos Passos:</h3>
                <ul>
                  <li>✅ Faça login na plataforma</li>
                  <li>🛒 Compre seu primeiro pacote de cartas</li>
                  <li>🎴 Monte seu deck na seção Deck Builder</li>
                  <li>🎲 Entre em duelos ranqueados</li>
                  <li>🏆 Participe de torneios</li>
                </ul>
              </div>
              
              <div style="text-align: center; margin-top: 30px; color: #94a3b8; font-size: 12px;">
                <p>Bons duelos e boa sorte!</p>
                <p>© 2025 YuGiOh RPG: Champions Of Duels</p>
              </div>
            </div>
          </body>
          </html>
        `,
      });

      console.log(`✅ Email de boas-vindas enviado para: ${email}`);
    } catch (error) {
      console.error('❌ Erro ao enviar email de boas-vindas:', error);
    }
  }

  async sendPasswordResetEmail(email: string, nickname: string, resetToken: string): Promise<boolean> {
    const resetUrl = `${this.frontendUrl}/reset-password/${resetToken}`;
    if (!this.transporter) {
      console.log(`\n⚠️ [MailService] Email não configurado - Link de redefinição para ${nickname} (${email}):`);
      console.log(`   ${resetUrl}\n`);
      return false;
    }
    try {
      await this.transporter.sendMail({
        from: `"YuGiOh RPG: Champions Of Duels" <${this.emailUser}>`,
        to: email.trim().toLowerCase(),
        subject: '🔐 Redefinir senha - YuGiOh RPG: Champions Of Duels',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; background-color: #1a1a2e; color: #fff; margin: 0; padding: 0; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; background: linear-gradient(135deg, #16213e 0%, #0f3460 100%); border-radius: 10px; }
              .header { text-align: center; padding: 20px; background: rgba(139, 92, 246, 0.1); border-radius: 10px; margin-bottom: 20px; }
              h1 { color: #fbbf24; margin: 0; font-size: 24px; }
              .button { display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 16px 0; }
              .footer { text-align: center; color: #94a3b8; font-size: 12px; margin-top: 24px; }
              .warning { padding: 12px; background: rgba(239, 68, 68, 0.1); border-left: 4px solid #ef4444; margin-top: 16px; border-radius: 4px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header"><h1>🎴 YuGiOh RPG: Champions Of Duels</h1></div>
              <p>Olá, <strong>${nickname}</strong>!</p>
              <p>Recebemos uma solicitação para redefinir a senha da sua conta.</p>
              <p>Clique no botão abaixo para criar uma nova senha:</p>
              <p style="text-align: center;"><a href="${resetUrl}" class="button">Redefinir senha</a></p>
              <p style="word-break: break-all; color: #60a5fa; font-size: 12px;">Ou copie o link: ${resetUrl}</p>
              <div class="warning"><strong>⚠️</strong> Este link expira em 1 hora. Se você não pediu a redefinição, ignore este email.</div>
              <div class="footer"><p>© YuGiOh RPG: Champions Of Duels</p></div>
            </div>
          </body>
          </html>
        `,
      });
      return true;
    } catch (error: any) {
      console.error('❌ Erro ao enviar email de redefinição:', error?.message);
      return false;
    }
  }

  async sendEmailChangeConfirmation(
    currentEmail: string,
    nickname: string,
    token: string,
    newEmail: string,
  ): Promise<boolean> {
    const confirmUrl = `${this.frontendUrl}/confirm-email-change/${token}`;
    if (!this.transporter) {
      console.log(`\n⚠️ [MailService] Email não configurado - Link de confirmação de troca de email para ${nickname}:`);
      console.log(`   ${confirmUrl}\n`);
      return false;
    }
    try {
      await this.transporter.sendMail({
        from: `"YuGiOh RPG: Champions Of Duels" <${this.emailUser}>`,
        to: currentEmail.trim().toLowerCase(),
        subject: '✉️ Confirmar troca de email - YuGiOh RPG: Champions Of Duels',
        html: `
          <!DOCTYPE html>
          <html lang="pt-BR">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f0f1a; color: #e2e8f0; margin: 0; padding: 24px; -webkit-font-smoothing: antialiased; }
              .wrapper { max-width: 520px; margin: 0 auto; }
              .card { background: #1a1a2e; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.4); }
              .brand { background: linear-gradient(135deg, #2d1b4e 0%, #1e3a5f 100%); padding: 28px 24px; text-align: center; border-bottom: 2px solid rgba(251, 191, 36, 0.3); }
              .brand h1 { color: #fbbf24; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: -0.5px; }
              .brand p { color: #94a3b8; margin: 8px 0 0 0; font-size: 13px; }
              .body { padding: 28px 24px; }
              .body p { margin: 0 0 16px 0; line-height: 1.6; font-size: 15px; color: #cbd5e1; }
              .body .hi { font-size: 17px; margin-bottom: 20px; }
              .body .hi strong { color: #fbbf24; }
              .email-box { background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.3); border-radius: 10px; padding: 16px 18px; margin: 20px 0; }
              .email-box .label { font-size: 12px; color: #94a3b8; margin-bottom: 4px; }
              .email-box .value { font-size: 16px; font-weight: 600; color: #fbbf24; word-break: break-all; }
              .cta-wrap { text-align: center; margin: 28px 0; }
              .cta { display: inline-block; padding: 16px 36px; background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%); color: #fff !important; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 16px; }
              .link-fallback { margin-top: 20px; padding: 14px; background: rgba(96, 165, 250, 0.12); border-radius: 8px; border-left: 4px solid #60a5fa; word-break: break-all; font-size: 12px; color: #93c5fd; }
              .warning { padding: 18px; background: rgba(239, 68, 68, 0.12); border-left: 4px solid #ef4444; border-radius: 0 8px 8px 0; margin-top: 24px; }
              .warning strong { color: #fca5a5; }
              .warning p { margin: 8px 0 0 0; color: #fecaca; font-size: 13px; line-height: 1.6; }
              .footer { text-align: center; padding: 24px 24px 28px; color: #64748b; font-size: 12px; }
              .footer p { margin: 4px 0; }
            </style>
          </head>
          <body>
            <div class="wrapper">
              <div class="card">
                <div class="brand">
                  <h1>🎴 YuGiOh RPG: Champions Of Duels</h1>
                  <p>Confirmar alteração de email</p>
                </div>
                <div class="body">
                  <p class="hi">Olá, <strong>${nickname}</strong>!</p>
                  <p>Foi solicitada a alteração do email da sua conta. O novo email será:</p>
                  <div class="email-box">
                    <div class="label">Novo email</div>
                    <div class="value">${newEmail}</div>
                  </div>
                  <p>Para confirmar a troca, clique no botão abaixo. Este link foi enviado para seu email atual (<strong style="color: #94a3b8;">${currentEmail}</strong>) por segurança.</p>
                  <div class="cta-wrap">
                    <a href="${confirmUrl}" class="cta">Confirmar troca de email</a>
                  </div>
                  <p style="margin-bottom: 8px; font-size: 13px; color: #94a3b8;">Se o botão não funcionar, copie e cole este link no navegador:</p>
                  <div class="link-fallback">${confirmUrl}</div>
                  <div class="warning">
                    <strong>Importante</strong>
                    <p>Este link expira em 1 hora. Se você não solicitou a troca, ignore este email e sua conta permanecerá com o email atual.</p>
                  </div>
                </div>
                <div class="footer">
                  <p>Este é um email automático. Não responda.</p>
                  <p>© 2025 YuGiOh RPG: Champions Of Duels</p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `,
      });
      return true;
    } catch (error: any) {
      console.error('❌ Erro ao enviar email de confirmação de troca:', error?.message);
      return false;
    }
  }
}
