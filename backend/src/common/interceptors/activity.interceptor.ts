import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { UsersService } from '../../modules/users/users.service';

@Injectable()
export class ActivityInterceptor implements NestInterceptor {
  constructor(private usersService: UsersService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user; // JWT Strategy coloca o user aqui

    // Se há um usuário autenticado, atualizar última atividade e marcar como online
    if (user && user.id) {
      // Executar de forma assíncrona sem bloquear a requisição
      this.usersService.updateLastActivity(user.id).catch((error) => {
        // Silenciosamente ignorar erros para não quebrar requisições
        console.error(`❌ [ActivityInterceptor] Erro ao atualizar atividade do usuário ${user.id}:`, error);
      });
    }

    return next.handle();
  }
}

