import { Global, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from './dto/config.dto';

@Global()
@Injectable()
export class EnvConfigService {
  constructor(private configService: ConfigService<EnvironmentVariables>) {}

  get appEnvironment(): string {
    return this.configService.get<string>('NODE_ENV');
  }

  get port(): number {
    return this.configService.get<number>('PORT');
  }

  get applicationName(): string {
    return this.configService.get<string>('APP_NAME');
  }
}
