import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EnvConfigService } from './env-config.service';
import { validateConfig } from './env-validate';

@Global()
@Module({
  imports: [ConfigModule.forRoot({ validate: validateConfig })],
  providers: [ConfigService, EnvConfigService],
  exports: [ConfigService, EnvConfigService],
})
export class EnvConfigModule {}
