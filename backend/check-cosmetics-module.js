// Script para verificar se o módulo Cosmetics está sendo carregado
const fs = require('fs');
const path = require('path');

console.log('🔍 Verificando módulo Cosmetics...\n');

// Verificar se o arquivo do módulo existe
const modulePath = path.join(__dirname, 'src', 'modules', 'cosmetics', 'cosmetics.module.ts');
if (fs.existsSync(modulePath)) {
  console.log('✅ CosmeticsModule.ts existe');
} else {
  console.log('❌ CosmeticsModule.ts NÃO existe');
}

// Verificar se está importado no app.module
const appModulePath = path.join(__dirname, 'src', 'app.module.ts');
const appModuleContent = fs.readFileSync(appModulePath, 'utf8');
if (appModuleContent.includes('CosmeticsModule')) {
  console.log('✅ CosmeticsModule está importado no AppModule');
} else {
  console.log('❌ CosmeticsModule NÃO está importado no AppModule');
}

// Verificar se o controller existe
const controllerPath = path.join(__dirname, 'src', 'modules', 'cosmetics', 'cosmetics.controller.ts');
if (fs.existsSync(controllerPath)) {
  console.log('✅ CosmeticsController.ts existe');
} else {
  console.log('❌ CosmeticsController.ts NÃO existe');
}

// Verificar se o service existe
const servicePath = path.join(__dirname, 'src', 'modules', 'cosmetics', 'cosmetics.service.ts');
if (fs.existsSync(servicePath)) {
  console.log('✅ CosmeticsService.ts existe');
} else {
  console.log('❌ CosmeticsService.ts NÃO existe');
}

console.log('\n💡 Se todos os arquivos existem, o backend precisa ser REINICIADO para carregar o módulo!');










