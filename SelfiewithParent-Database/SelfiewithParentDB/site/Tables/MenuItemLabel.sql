-- Menu labels in the other site languages (English is site.MenuItem.Label). Missing languages fall back to English.
CREATE TABLE [site].[MenuItemLabel]
(
    [MenuItemId]    INT             NOT NULL,
    [LanguageCode]  VARCHAR (5)     NOT NULL,
    [Label]         NVARCHAR (100)  NOT NULL,

    CONSTRAINT [PK_MenuItemLabel] PRIMARY KEY CLUSTERED ([MenuItemId] ASC, [LanguageCode] ASC),
    CONSTRAINT [FK_MenuItemLabel_MenuItem] FOREIGN KEY ([MenuItemId]) REFERENCES [site].[MenuItem] ([MenuItemId]) ON DELETE CASCADE,
    CONSTRAINT [CK_MenuItemLabel_Language] CHECK ([LanguageCode] IN ('hi', 'bn', 'ar', 'es', 'fr')),
    CONSTRAINT [CK_MenuItemLabel_NoMarkup] CHECK ([Label] NOT LIKE '%<%' AND [Label] NOT LIKE '%>%')
);
GO
