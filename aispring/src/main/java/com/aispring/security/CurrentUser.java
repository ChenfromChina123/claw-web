package com.aispring.security;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.security.core.annotation.AuthenticationPrincipal;

/**
 * 自定义注解，用于获取当前认证用户
 * 参考FastAPI的依赖注入理念，简化控制器中获取当前用户的代码
 */
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
@AuthenticationPrincipal(expression = "@userService.getUserByEmail(#this.username)")
public @interface CurrentUser {
}
