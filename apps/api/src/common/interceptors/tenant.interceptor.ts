import { Injectable, NestInterceptor, ExecutionContext, CallHandler, UnauthorizedException } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    
    if (request.user && request.user.tenantId) {
      // We can attach the tenantId to the request body or query if needed
      // to ensure subsequent validation pipes catch it,
      // but usually the controller extracts it via @CurrentTenant().
      // This interceptor serves as an additional safety net or context setter.
    } else {
       // Only enforce if the route is protected by AuthGuard
       // If it's a public route, we might not have a user
    }

    return next.handle();
  }
}
