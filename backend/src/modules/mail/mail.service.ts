import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter;

  constructor() {
    // Debug: verificar variáveis de ambiente
    console.log('🔍 [MailService] Verificando variáveis de ambiente...');
    console.log(`   EMAIL_USER: ${process.env.EMAIL_USER || 'NÃO DEFINIDO'}`);
    console.log(`   EMAIL_PASSWORD: ${process.env.EMAIL_PASSWORD ? 'DEFINIDO (' + process.env.EMAIL_PASSWORD.length + ' caracteres)' : 'NÃO DEFINIDO'}`);
    console.log(`   FRONTEND_URL: ${process.env.FRONTEND_URL || 'NÃO DEFINIDO'}`);
    
    // Se não tiver configuração de email, usar Ethereal (email de teste)
    if (!process.env.EMAIL_USER || process.env.EMAIL_USER === 'seu-email@gmail.com') {
      // Modo de desenvolvimento - apenas loga no console
      console.log('⚠️ [MailService] Email não configurado - links aparecerão no console');
      console.log('💡 [MailService] Dica: Verifique se as variáveis EMAIL_USER e EMAIL_PASSWORD estão no arquivo .env na pasta backend/');
      this.transporter = null;
    } else {
      // Remover espaços da senha se houver
      const emailPassword = process.env.EMAIL_PASSWORD?.replace(/\s/g, '') || process.env.EMAIL_PASSWORD;
      
      console.log(`📧 [MailService] Configurando email com usuário: ${process.env.EMAIL_USER}`);
      console.log(`📧 [MailService] Senha configurada: ${emailPassword ? 'Sim (' + emailPassword.length + ' caracteres)' : 'Não'}`);
      console.log(`📧 [MailService] FRONTEND_URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
      
      if (!emailPassword) {
        console.error('❌ [MailService] EMAIL_PASSWORD não está configurado!');
        this.transporter = null;
        return;
      }
      
      // Configuração para Gmail com opções de segurança relaxadas
      this.transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
          user: process.env.EMAIL_USER,
          pass: emailPassword,
        },
        tls: {
          rejectUnauthorized: false,
        },
      });
      
      // Testar conexão
      console.log('🔍 [MailService] Verificando conexão SMTP...');
      this.transporter.verify((error, success) => {
        if (error) {
          const smtpError = error as any;
          console.error('❌ [MailService] Erro ao verificar conexão SMTP:');
          console.error(`   Tipo: ${smtpError?.code || 'Desconhecido'}`);
          console.error(`   Mensagem: ${smtpError?.message || 'Erro desconhecido'}`);
          if (smtpError.code === 'EAUTH') {
            console.error('💡 [MailService] Dica: Verifique se está usando a Senha de App do Gmail, não a senha normal');
          }
        } else {
          console.log('✅ [MailService] Conexão SMTP verificada com sucesso!');
          console.log('✅ [MailService] Pronto para enviar emails!');
        }
      });
    }
  }

  async sendVerificationEmail(email: string, nickname: string, token: string): Promise<boolean> {
    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email/${token}`;

    // Se não tem transporter configurado, apenas loga
    if (!this.transporter) {
      console.log(`\n⚠️ [MailService] Email não configurado - Link de verificação para ${nickname} (${email}):`);
      console.log(`   ${verificationUrl}\n`);
      return false;
    }

    console.log(`📧 [MailService] ========== INÍCIO DO ENVIO DE EMAIL ==========`);
    console.log(`📧 [MailService] Tentando enviar email de verificação para: ${email}`);
    console.log(`📧 [MailService] URL de verificação: ${verificationUrl}`);
    console.log(`📧 [MailService] De: ${process.env.EMAIL_USER}`);
    console.log(`📧 [MailService] Para: ${email}`);
    console.log(`📧 [MailService] Transporter existe: ${this.transporter ? 'SIM' : 'NÃO'}`);

    try {
      const info = await this.transporter.sendMail({
        from: `"Yu-Gi-Oh Game" <${process.env.EMAIL_USER}>`,
        to: email,
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
        from: `"Yu-Gi-Oh Game" <${process.env.EMAIL_USER}>`,
        to: email,
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
}
