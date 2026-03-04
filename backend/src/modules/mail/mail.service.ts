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

    if (!this.emailUser || this.emailUser === 'seu-email@gmail.com') {
      console.log('⚠️ [MailService] Email não configurado - links aparecerão no console');
      console.log('💡 [MailService] Dica: Defina EMAIL_USER e EMAIL_PASSWORD no arquivo backend/.env');
      return;
    }
    if (!emailPassword) {
      console.error('❌ [MailService] EMAIL_PASSWORD não está configurado!');
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
        from: `"Yu-Gi-Oh Game" <${this.emailUser}>`,
        to: toAddress,
        subject: '🎴 Confirme seu cadastro no Yu-Gi-Oh Game',
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
              .content {
                padding: 20px;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 8px;
                margin-bottom: 20px;
              }
              .button {
                display: inline-block;
                padding: 15px 30px;
                background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
                color: white;
                text-decoration: none;
                border-radius: 8px;
                font-weight: bold;
                text-align: center;
                margin: 20px 0;
              }
              .button:hover {
                background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
              }
              .footer {
                text-align: center;
                color: #94a3b8;
                font-size: 12px;
                margin-top: 30px;
              }
              .warning {
                padding: 15px;
                background: rgba(239, 68, 68, 0.1);
                border-left: 4px solid #ef4444;
                margin-top: 20px;
                border-radius: 4px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🎴 Yu-Gi-Oh Game</h1>
              </div>
              
              <div class="content">
                <p>Olá, <strong style="color: #fbbf24;">${nickname}</strong>!</p>
                
                <p>Bem-vindo ao Yu-Gi-Oh Game! 🎉</p>
                
                <p>Para ativar sua conta e começar a duelar, clique no botão abaixo:</p>
                
                <div style="text-align: center;">
                  <a href="${verificationUrl}" class="button">
                    ✅ Confirmar Email
                  </a>
                </div>
                
                <p>Ou copie e cole este link no seu navegador:</p>
                <p style="word-break: break-all; color: #60a5fa; background: rgba(96, 165, 250, 0.1); padding: 10px; border-radius: 4px;">
                  ${verificationUrl}
                </p>
              </div>
              
              <div class="warning">
                <strong>⚠️ Importante:</strong>
                <ul style="margin: 10px 0 0 0; padding-left: 20px;">
                  <li>Este link expira em 24 horas</li>
                  <li>Se você não criou esta conta, ignore este email</li>
                  <li>Nunca compartilhe este link com outras pessoas</li>
                </ul>
              </div>
              
              <div class="footer">
                <p>Este é um email automático, não responda.</p>
                <p>© 2025 Yu-Gi-Oh Game. Todos os direitos reservados.</p>
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
        from: `"Yu-Gi-Oh Game" <${this.emailUser}>`,
        to: email.trim().toLowerCase(),
        subject: '🎉 Bem-vindo ao Yu-Gi-Oh Game!',
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
                <h1>🎴 Yu-Gi-Oh Game</h1>
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
                <p>© 2025 Yu-Gi-Oh Game</p>
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
        from: `"Yu-Gi-Oh Game" <${this.emailUser}>`,
        to: email.trim().toLowerCase(),
        subject: '🔐 Redefinir senha - Yugioh RPG',
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
              <div class="header"><h1>🎴 Yugioh RPG</h1></div>
              <p>Olá, <strong>${nickname}</strong>!</p>
              <p>Recebemos uma solicitação para redefinir a senha da sua conta.</p>
              <p>Clique no botão abaixo para criar uma nova senha:</p>
              <p style="text-align: center;"><a href="${resetUrl}" class="button">Redefinir senha</a></p>
              <p style="word-break: break-all; color: #60a5fa; font-size: 12px;">Ou copie o link: ${resetUrl}</p>
              <div class="warning"><strong>⚠️</strong> Este link expira em 1 hora. Se você não pediu a redefinição, ignore este email.</div>
              <div class="footer"><p>© Yugioh RPG: Champions Of Duels</p></div>
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
        from: `"Yu-Gi-Oh Game" <${this.emailUser}>`,
        to: currentEmail.trim().toLowerCase(),
        subject: '✉️ Confirmar troca de email - Yugioh RPG',
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
              .highlight { background: rgba(251, 191, 36, 0.15); padding: 8px 12px; border-radius: 6px; margin: 8px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header"><h1>🎴 Yugioh RPG</h1></div>
              <p>Olá, <strong>${nickname}</strong>!</p>
              <p>Foi solicitada a alteração do email da sua conta para:</p>
              <div class="highlight"><strong>${newEmail}</strong></div>
              <p>Para confirmar a troca, clique no botão abaixo. O link será enviado para este email (${currentEmail}).</p>
              <p style="text-align: center;"><a href="${confirmUrl}" class="button">Confirmar troca de email</a></p>
              <p style="word-break: break-all; color: #60a5fa; font-size: 12px;">Ou copie o link: ${confirmUrl}</p>
              <div class="warning"><strong>⚠️</strong> Este link expira em 1 hora. Se você não pediu a troca, ignore este email e sua conta permanecerá com o email atual.</div>
              <div class="footer"><p>© Yugioh RPG: Champions Of Duels</p></div>
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
