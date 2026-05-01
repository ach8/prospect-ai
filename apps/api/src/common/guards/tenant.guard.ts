import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // Assuming JwtAuthGuard has already run and populated request.user
    if (!request.user || !request.user.tenantId) {
      return false; // Deny access if no tenant context is found
    }

    return true;
  }
}
