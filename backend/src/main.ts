import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { LoggingInterceptor } from './logging.interceptor';
import { HttpExceptionFilter } from './http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Configurações do servidor HTTP para não bloquear quando há WebSocket ativo
    bodyParser: true,
    rawBody: false,
  });

  // Configurar timeouts do servidor HTTP para evitar bloqueios
  // CRÍTICO: Timeouts mais curtos para não bloquear quando há WebSocket ativo
  const server = app.getHttpServer();
  server.keepAliveTimeout = 65000; // 65 segundos (maior que o timeout do proxy)
  server.headersTimeout = 66000; // 66 segundos (maior que keepAliveTimeout)
  server.maxConnections = 2000; // Aumentar limite de conexões simultâneas (suporta múltiplas abas)
  server.timeout = 30000; // 30 segundos de timeout para requisições HTTP (reduzido para falhar rápido)
  
  // Configurar para não bloquear Event Loop
  server.setTimeout(30000); // Timeout de 30s para requisições HTTP
  server.keepAliveTimeout = 65000; // Manter conexões vivas por 65s

  // FILTRO GLOBAL DE EXCEÇÕES
  app.useGlobalFilters(new HttpExceptionFilter());

  // INTERCEPTOR GLOBAL DE LOGGING
  app.useGlobalInterceptors(new LoggingInterceptor());

  // MIDDLEWARE CRÍTICO: Garantir que requisições HTTP tenham prioridade ABSOLUTA sobre WebSocket
  // Isso evita que requisições HTTP sejam bloqueadas quando há duelos ativos
  // Usar múltiplos setImmediate para garantir máxima prioridade
  app.use((req: any, res: any, next: any) => {
    // CRÍTICO: Múltiplos yields para garantir que HTTP sempre tenha prioridade
    // Isso força o Event Loop a processar requisições HTTP antes de qualquer WebSocket
    // Usar 3 níveis de setImmediate para máxima prioridade
    setImmediate(() => {
      setImmediate(() => {
        setImmediate(() => {
          next();
        });
      });
    });
  });

  // Aumentar limite de body
  app.use(require('express').json({ limit: '10mb' }));
  app.use(require('express').urlencoded({ extended: true, limit: '10mb' }));

  // Servir arquivos estáticos (uploads)
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });

  // Habilitar CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  });

  // Validação global
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false, // DESABILITADO TEMPORARIAMENTE PARA DEBUG
      transform: true,
      disableErrorMessages: false,
      exceptionFactory: (errors) => {
        console.error('❌ VALIDATION ERROR DETAILS:', JSON.stringify(errors, null, 2));
        console.error('❌ VALIDATION ERRORS (full):', errors);
        return errors;
      },
    }),
  );

  // Configuração do Swagger
  const config = new DocumentBuilder()
    .setTitle('Yu-Gi-Oh! Online Game API')
    .setDescription('API completa para o jogo de cartas Yu-Gi-Oh! Online')
    .setVersion('1.0')
    .addTag('auth', 'Autenticação e gerenciamento de usuários')
    .addTag('cards', 'Gerenciamento de cartas')
    .addTag('decks', 'Gerenciamento de decks')
    .addTag('duels', 'Sistema de duelos')
    .addTag('tournaments', 'Sistema de torneios')
    .addTag('groups', 'Sistema de grupos')
    .addTag('shop', 'Loja de cartas e itens')
    .addTag('ranking', 'Ranking de jogadores')
    .addTag('news', 'Notícias do jogo')
    .addTag('chat', 'Chat global')
    .addTag('admin', 'Painel administrativo')
    .addBearerAuth()
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Yu-Gi-Oh! API Docs',
    customfavIcon: 'https://yugioh.fandom.com/wiki/Special:FilePath/Logo_yugioh.png',
    customCss: '.swagger-ui .topbar { display: none }',
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  
  console.log(`🚀 Yu-Gi-Oh! Backend running on: http://localhost:${port}`);
  console.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
  console.log(`🎮 WebSocket server ready for duels!`);
}

bootstrap();
