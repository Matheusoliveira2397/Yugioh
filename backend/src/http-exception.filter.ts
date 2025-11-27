import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let details: any = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as any;
        message = responseObj.message || message;
        details = responseObj;
        
        // Se for erro de validação, incluir detalhes
        if (Array.isArray(responseObj.message)) {
          message = 'Erro de validação: ' + responseObj.message.join(', ');
          details = { validationErrors: responseObj.message };
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      
      // Se a mensagem indica um erro de validação/lógica de negócio, retornar 400
      if (exception.message.includes('Não é possível') || 
          exception.message.includes('não pode') ||
          exception.message.includes('está sendo usada') ||
          exception.message.includes('Use a opção')) {
        status = HttpStatus.BAD_REQUEST;
      }
      // Tratar erros específicos do banco de dados
      else if (exception.message.includes('foreign key constraint') || exception.message.includes('violates foreign key')) {
        message = exception.message.includes('Não é possível') 
          ? exception.message 
          : 'Não é possível realizar esta operação pois a carta está sendo usada por outros registros.';
        status = HttpStatus.BAD_REQUEST;
      } else if (exception.message.includes('QueryFailedError')) {
        // Erros de query do banco
        if (exception.message.includes('foreign key')) {
          message = 'Não é possível deletar esta carta pois ela está sendo usada por outros registros.';
          status = HttpStatus.BAD_REQUEST;
        } else {
          message = 'Erro ao processar operação no banco de dados.';
          status = HttpStatus.INTERNAL_SERVER_ERROR;
        }
      }
    }

    console.error('❌ Exception caught:', {
      status,
      message,
      path: request.url,
      method: request.method,
      error: exception instanceof Error ? exception.stack : exception,
    });

    response.status(status).json({
      statusCode: status,
      message,
      ...(details && { details }),
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}

