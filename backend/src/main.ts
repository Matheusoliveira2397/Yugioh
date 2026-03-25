import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join, resolve, sep } from 'path';
import { LoggingInterceptor } from './logging.interceptor';
import { HttpExceptionFilter } from './http-exception.filter';
import { RedisIoAdapter } from './redis-io.adapter';
import * as fs from 'fs';

function resolveUploadsRoot(): string {
  const envRoot = process.env.UPLOADS_ROOT?.trim();
  if (envRoot) return resolve(envRoot);
  if (fs.existsSync('/app/uploads')) return '/app/uploads';
  return resolve(join(__dirname, '..', 'uploads'));
}

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

  // Garantir que os diretórios e arquivos padrão existam
  const uploadsDir = resolveUploadsRoot();
  const avatarsDir = join(uploadsDir, 'avatars');
  const imagesDir = join(uploadsDir, 'images');
  const groupsDir = join(uploadsDir, 'groups');
  const defaultAvatarPath = join(avatarsDir, 'default.jpg');
  const defaultImagePath = join(imagesDir, 'default.jpg');
  const frontendDefaultPath = join(__dirname, '..', '..', 'frontend', 'public', 'images', 'default.jpg');

  // Criar diretórios se não existirem
  if (!fs.existsSync(avatarsDir)) {
    fs.mkdirSync(avatarsDir, { recursive: true });
    console.log('📁 Diretório de avatares criado:', avatarsDir);
  }
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
    console.log('📁 Diretório de imagens criado:', imagesDir);
  }
  if (!fs.existsSync(groupsDir)) {
    fs.mkdirSync(groupsDir, { recursive: true });
    console.log('📁 Diretório de grupos criado:', groupsDir);
  }
  const cardsUploadDir = join(uploadsDir, 'cards');
  if (!fs.existsSync(cardsUploadDir)) {
    fs.mkdirSync(cardsUploadDir, { recursive: true });
    console.log('📁 Diretório de cartas (uploads) criado:', cardsUploadDir);
  }

  // Sempre sobrescrever com o arquivo canônico do frontend (evita ficar com default antigo em uploads/).
  if (fs.existsSync(frontendDefaultPath)) {
    try {
      fs.copyFileSync(frontendDefaultPath, defaultAvatarPath);
      fs.copyFileSync(frontendDefaultPath, defaultImagePath);
      console.log('✅ default.jpg sincronizado (frontend/public/images → uploads/avatars e uploads/images)');
    } catch (error) {
      console.warn('⚠️ Não foi possível sincronizar default.jpg do frontend para uploads.', error);
    }
  } else {
    console.warn('⚠️ frontend/public/images/default.jpg não encontrado — coloque o avatar padrão nesse caminho.');
  }

  // Servir arquivos estáticos (uploads) com cache para reduzir carga e melhorar carregamento em produção
  app.useStaticAssets(uploadsDir, {
    prefix: '/uploads/',
    setHeaders: (res: any) => {
      res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 dia
    },
  });

  // Avatar salvo no DB mas arquivo ausente no disco (volume novo, deploy, exclusão manual) → não retornar 404 ao <img>
  app.use((req: any, res: any, next: any) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const p: string = req.path || '';
    const prefix = '/uploads/avatars/';
    if (!p.startsWith(prefix)) return next();
    const relRaw = p.slice(prefix.length);
    if (!relRaw) return next();
    let rel: string;
    try {
      rel = decodeURIComponent(relRaw);
    } catch {
      return next();
    }
    if (!/^[\w.-]+$/.test(rel)) return next();
    const baseResolved = resolve(avatarsDir);
    const filePath = resolve(join(avatarsDir, rel));
    if (!filePath.startsWith(baseResolved + sep) && filePath !== baseResolved) return next();

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = rel.toLowerCase();
      if (ext.endsWith('.png')) res.setHeader('Content-Type', 'image/png');
      else if (ext.endsWith('.webp')) res.setHeader('Content-Type', 'image/webp');
      else if (ext.endsWith('.gif')) res.setHeader('Content-Type', 'image/gif');
      else res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      return fs.createReadStream(filePath).pipe(res);
    }

    if (!fs.existsSync(defaultAvatarPath)) return next();
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=120');
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(defaultAvatarPath).pipe(res);
  });

  // Logo/banner de grupo ausente no disco: evitar 404 ruidoso e retornar placeholder.
  app.use((req: any, res: any, next: any) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const p: string = req.path || '';
    const prefix = '/uploads/groups/';
    if (!p.startsWith(prefix)) return next();
    const relRaw = p.slice(prefix.length);
    if (!relRaw) return next();
    let rel: string;
    try {
      rel = decodeURIComponent(relRaw);
    } catch {
      return next();
    }
    if (!/^[\w.-]+$/.test(rel)) return next();
    const baseResolved = resolve(groupsDir);
    const filePath = resolve(join(groupsDir, rel));
    if (!filePath.startsWith(baseResolved + sep) && filePath !== baseResolved) return next();

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = rel.toLowerCase();
      if (ext.endsWith('.png')) res.setHeader('Content-Type', 'image/png');
      else if (ext.endsWith('.webp')) res.setHeader('Content-Type', 'image/webp');
      else if (ext.endsWith('.gif')) res.setHeader('Content-Type', 'image/gif');
      else res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      return fs.createReadStream(filePath).pipe(res);
    }

    if (!fs.existsSync(defaultImagePath)) return next();
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=120');
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(defaultImagePath).pipe(res);
  });

  // Servir avatares padrão com cache
  app.useStaticAssets(avatarsDir, {
    prefix: '/avatars/',
    setHeaders: (res: any) => {
      res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 dia
    },
  });

  // CRÍTICO: Servir imagens das cartas do frontend PRIMEIRO (antes de qualquer outra rota /images/)
  // Isso garante que /images/cards/* seja servido antes de /images/*
  // Tentar múltiplos caminhos possíveis (desenvolvimento local e Docker)
  const frontendCardsPaths = [
    // Docker: volume mapeado
    '/app/frontend-cards',
    // Desenvolvimento local: caminho relativo
    join(__dirname, '..', '..', 'frontend', 'public', 'images', 'cards'),
    // Fallback: tentar encontrar o diretório raiz do projeto
    (() => {
      let projectRoot = __dirname;
      while (projectRoot !== join(projectRoot, '..')) {
        const frontendPath = join(projectRoot, '..', 'frontend', 'public', 'images', 'cards');
        if (fs.existsSync(join(projectRoot, '..', 'frontend'))) {
          return frontendPath;
        }
        const parentRoot = join(projectRoot, '..');
        if (parentRoot === projectRoot) break; // Evitar loop infinito
        projectRoot = parentRoot;
      }
      return null;
    })(),
  ].filter(Boolean);

  // Encontrar o primeiro caminho que existe
  let cardsPath: string | null = null;
  for (const pathOption of frontendCardsPaths) {
    if (pathOption && fs.existsSync(pathOption)) {
      cardsPath = pathOption;
      console.log(`✅ Diretório de cartas encontrado: ${cardsPath}`);
      // Verificar se há arquivos no diretório
      try {
        const files = fs.readdirSync(pathOption);
        console.log(`📁 Arquivos encontrados no diretório de cartas: ${files.length} arquivos`);
        if (files.length > 0) {
          console.log(`📄 Primeiros 5 arquivos: ${files.slice(0, 5).join(', ')}`);
        }
      } catch (error) {
        console.warn(`⚠️ Erro ao listar arquivos do diretório: ${error}`);
      }
      break;
    }
  }

  if (cardsPath) {
    // Middleware: quando a URL tem query (?t=...) é cache-buster do admin; não cachear
    const express = require('express');
    app.use('/images/cards', (req: any, res: any, next: any) => {
      if (req.url && req.url.includes('?')) {
        (res as any)._cardImageNoCache = true;
      }
      next();
    });
    app.use('/images/cards', express.static(cardsPath, {
      index: false,
      setHeaders: (res: any, path: string) => {
        if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
          res.setHeader('Content-Type', 'image/jpeg');
        } else if (path.endsWith('.png')) {
          res.setHeader('Content-Type', 'image/png');
        } else if (path.endsWith('.webp')) {
          res.setHeader('Content-Type', 'image/webp');
        }
        if ((res as any)._cardImageNoCache) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }));
    
    console.log(`✅ Servindo imagens de cartas de: ${cardsPath}`);
  } else {
    console.warn('⚠️ Diretório de cartas não encontrado. Verifique se o volume está mapeado corretamente.');
  }

  // Servir imagens padrão (DEPOIS de /images/cards/ para não conflitar) com cache
  app.useStaticAssets(imagesDir, {
    prefix: '/images/',
    index: false,
    setHeaders: (res: any) => {
      res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 dia
    },
  });

  // Habilitar CORS (aceita várias origens separadas por vírgula: https://www.site.com,https://site.com)
  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
  const corsOrigins = corsOrigin.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({
    origin: corsOrigins.length > 1 ? corsOrigins : corsOrigins[0] || 'http://localhost:5173',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
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

  // Socket.IO: usar Redis adapter em produção quando REDIS_URL estiver definido (múltiplas instâncias)
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`🚀 Yu-Gi-Oh! Backend running on: http://localhost:${port}`);
  console.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
  console.log(`🎮 WebSocket server ready for duels!`);
}

bootstrap();
