import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // Logging desabilitado para reduzir verbosidade
    // Descomente apenas para debug específico
    // const request = context.switchToHttp().getRequest();
    // const { method, url } = request;
    // console.log(`🌐 [${method}] ${url}`);
    
    return next.handle();
  }
}
