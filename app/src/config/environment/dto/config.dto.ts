import { Exclude, Expose } from 'class-transformer';
import {IsNumber, IsString } from 'class-validator';



@Exclude()
export class EnvironmentVariables {
 
  @Expose()
  @IsString()
  NODE_ENV: string;

  @Expose()
  @IsNumber()
  PORT: number;

  @Expose()
  @IsString()
  APP_NAME: string;

  @Expose()
  @IsString()
  APP_BASE_URL: string;

}
