import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { EnvConfigService } from './config/environment/env-config.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const { port, applicationName } = app.get(EnvConfigService);

  app.enableShutdownHooks();
  app.enableCors();
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`Application: ${applicationName} running on port ${port}`);
}
void bootstrap();
