import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class LocalMasterAuthGuard extends AuthGuard('local-master') {}
