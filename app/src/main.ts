import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { EnvConfigService } from './config/environment/env-config.service';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

  const { port, applicationName } = app.get(EnvConfigService);

  app.enableShutdownHooks();
  app.enableCors();
  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`Application: ${applicationName} running on port ${port}`);
}
void bootstrap();