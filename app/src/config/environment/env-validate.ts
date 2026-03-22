import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { EnvironmentVariables } from './dto/config.dto';

export const validateConfig = (
  config: Record<string, unknown>,
): EnvironmentVariables => {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
    forbidUnknownValues: true,
  });

  if (errors.length > 0) {
    const errorMessages = errors.map(
      error => `${error.property}: ${Object.values(error.constraints || {}).join(', ')}`
    ).join('\n  ');
    
    throw new Error(
      ` Environment validation failed: \n ${errorMessages}`
    );
  }

  return validatedConfig;
};